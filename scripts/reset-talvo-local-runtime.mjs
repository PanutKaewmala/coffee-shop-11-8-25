import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const sourceSupabaseDir = path.join(root, "supabase");
const sourceConfigPath = path.join(sourceSupabaseDir, "config.toml");
const baselinePath = path.join(sourceSupabaseDir, "local-runtime", "production-public-baseline.sql");
const baselineHashPath = path.join(sourceSupabaseDir, "local-runtime", "production-public-baseline.sha256");
const runtimeRoot = path.join(root, ".talvo-local-runtime");
const runtimeSupabaseDir = path.join(runtimeRoot, "supabase");
const runtimeMigrationsDir = path.join(runtimeSupabaseDir, "migrations");

// Pin the CLI used by this reproducible local-runtime script instead of
// depending on whatever global Supabase CLI happens to be installed.
const supabaseCliVersion = "2.95.3";
const localProjectId = "coffee-saas-v1-local-runtime";

const postBaselineMigrations = [
  "20260807090000_atomic_pos_checkout.sql",
  "20260817100000_talvo_supply_item_vertical_slice.sql",
  "20260819180000_talvo_receive_supply_item.sql",
  "20260819180100_talvo_receive_history_hardening.sql",
];

function fail(message) {
  console.error(`\nTALVO local runtime setup failed: ${message}`);
  process.exit(1);
}

function requireFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail(`Required file is missing: ${path.relative(root, filePath)}`);
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function spawnNpxSupabase(args, { workdir, capture = false } = {}) {
  const env = { ...process.env };
  if (workdir) env.SUPABASE_WORKDIR = workdir;

  const npxArgs = ["--yes", `supabase@${supabaseCliVersion}`, ...args];
  console.log(`\n> npx --yes supabase@${supabaseCliVersion} ${args.join(" ")}`);

  const options = {
    cwd: root,
    env,
    shell: false,
    ...(capture
      ? { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] }
      : { stdio: "inherit" }),
  };

  // npm/npx are .cmd launchers on Windows. Node 24 can reject spawning a .cmd
  // file directly with shell:false (EINVAL), so invoke it through cmd.exe.
  if (process.platform === "win32") {
    return spawnSync(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", `npx ${npxArgs.join(" ")}`],
      options,
    );
  }

  return spawnSync("npx", npxArgs, options);
}

function runSupabase(args, { workdir } = {}) {
  const result = spawnNpxSupabase(args, { workdir });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) {
    fail(`supabase ${args.join(" ")} exited with code ${result.status}`);
  }
}

function runResetWithWindowsStorageTolerance() {
  const args = ["db", "reset", "--local", "--no-seed"];
  const result = spawnNpxSupabase(args, { workdir: runtimeRoot, capture: true });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(result.error.message);
  if (result.status === 0) return;

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const allMigrationsApplied = [
    "20260805083001_production_public_runtime_baseline.sql",
    ...postBaselineMigrations,
  ].every((migration) => output.includes(`Applying migration ${migration}...`));

  const knownStorageRestartTimeout =
    /storage\/v1\/bucket/i.test(output) &&
    /context deadline exceeded|Client\.Timeout exceeded/i.test(output);

  if (allMigrationsApplied && knownStorageRestartTimeout) {
    console.warn(
      "\nSupabase reported a Windows storage health-check timeout after every migration had applied.\n" +
        "Treating this as a transient service restart issue and verifying the rebuilt database directly.",
    );
    sleep(5000);
    return;
  }

  fail(`supabase ${args.join(" ")} exited with code ${result.status}`);
}

function verifyDatabaseMarkers() {
  console.log("\nVerifying rebuilt database markers directly inside the local Postgres container...");

  const findDb = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      `label=com.supabase.cli.project=${localProjectId}`,
      "--filter",
      "name=supabase_db_",
      "--format",
      "{{.ID}}",
    ],
    { cwd: root, encoding: "utf8", shell: false },
  );

  if (findDb.error) fail(findDb.error.message);
  if (findDb.status !== 0) fail("Could not inspect the local Supabase Postgres container");

  const containerId = (findDb.stdout || "").trim().split(/\r?\n/).filter(Boolean)[0];
  if (!containerId) fail("Local Supabase Postgres container was not found after reset");

  const sql = [
    "select",
    "  exists (select 1 from pg_namespace where nspname = 'talvo')::int,",
    "  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_talvo_supply_item')::int,",
    "  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'receive_talvo_supply_item')::int,",
    "  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pos_idempotency' and column_name = 'request_hash')::int,",
    "  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'branch' and column_name = 'is_active')::int;",
  ].join(" ");

  const verify = spawnSync(
    "docker",
    ["exec", containerId, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c", sql],
    { cwd: root, encoding: "utf8", shell: false },
  );

  if (verify.stdout) process.stdout.write(verify.stdout);
  if (verify.stderr) process.stderr.write(verify.stderr);
  if (verify.error) fail(verify.error.message);
  if (verify.status !== 0) fail("Could not query the rebuilt local database");

  const markers = (verify.stdout || "").trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (markers !== "1|1|1|1|1") {
    fail(`Rebuilt database marker verification failed: ${markers || "no result"}`);
  }

  console.log("Verified: talvo schema, TALVO create/receive RPCs, POS request_hash, and branch.is_active are present.");
}

requireFile(sourceConfigPath);
requireFile(baselinePath);
requireFile(baselineHashPath);
for (const migration of postBaselineMigrations) {
  requireFile(path.join(sourceSupabaseDir, "migrations", migration));
}

const rawBaseline = fs.readFileSync(baselinePath, "utf8");
const expectedHash = fs.readFileSync(baselineHashPath, "utf8").trim().split(/\s+/)[0];
const actualHash = crypto.createHash("sha256").update(rawBaseline).digest("hex");
if (!/^[0-9a-f]{64}$/.test(expectedHash) || actualHash !== expectedHash) {
  fail("Verified production baseline SHA-256 does not match its recorded checksum");
}

if (/^(COPY|INSERT INTO) /m.test(rawBaseline)) {
  fail("Baseline unexpectedly contains top-level row-data statements");
}

// pg_dump emits psql-only guard commands and CREATE SCHEMA public, while a
// Supabase local stack already owns the public schema. Default privileges are
// role-state, not application schema, and are intentionally left to the local
// Supabase stack. Remove only those bootstrap-incompatible statements.
const sanitizedBaseline = rawBaseline
  .split(/\r?\n/)
  .filter((line) => !/^\\(?:restrict|unrestrict)\b/.test(line))
  .filter((line) => line.trim() !== "CREATE SCHEMA public;")
  .filter((line) => !/^ALTER DEFAULT PRIVILEGES\b/.test(line))
  .join("\n");

// CREATE INDEX CONCURRENTLY cannot run in the migration transaction path.
// Refuse that construct explicitly so this script fails closed if the chain changes.
const sqlToCheck = [
  sanitizedBaseline,
  ...postBaselineMigrations.map((migration) =>
    fs.readFileSync(path.join(sourceSupabaseDir, "migrations", migration), "utf8"),
  ),
].join("\n");
if (/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(sqlToCheck)) {
  fail("Runtime migration chain contains CREATE INDEX CONCURRENTLY, which this pinned CLI path does not support safely");
}

fs.rmSync(runtimeRoot, { recursive: true, force: true });
fs.mkdirSync(runtimeMigrationsDir, { recursive: true });

let config = fs.readFileSync(sourceConfigPath, "utf8");
config = config.replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${localProjectId}"`);
config = config.replace(/(\[db\.seed\][\s\S]*?^enabled\s*=\s*)true/m, "$1false");
fs.writeFileSync(path.join(runtimeSupabaseDir, "config.toml"), config);
fs.writeFileSync(path.join(runtimeSupabaseDir, "seed.sql"), "-- Intentionally empty. Local test fixtures are added separately.\n");

const runtimeBaselinePath = path.join(
  runtimeMigrationsDir,
  "20260805083001_production_public_runtime_baseline.sql",
);
fs.writeFileSync(
  runtimeBaselinePath,
  [
    "-- TALVO local runtime baseline only.",
    "-- Source: verified schema-only production public dump.",
    `-- Source SHA-256: ${actualHash}`,
    "-- This is not the canonical future TALVO schema.",
    "",
    sanitizedBaseline,
    "",
  ].join("\n"),
);

for (const migration of postBaselineMigrations) {
  fs.copyFileSync(
    path.join(sourceSupabaseDir, "migrations", migration),
    path.join(runtimeMigrationsDir, migration),
  );
}

console.log("\nPrepared isolated migration chain:");
console.log("  baseline -> 20260807090000 -> 20260817100000 -> 20260819180000 -> 20260819180100");
console.log(`  baseline SHA-256: ${actualHash}`);
console.log(`  Supabase CLI: ${supabaseCliVersion} (pinned via npx)`);
console.log("\nStopping the existing local Supabase stack (local only; no remote operation)...");
runSupabase(["stop"]);

console.log("\nStarting isolated TALVO local runtime...");
runSupabase(["start"], { workdir: runtimeRoot });

console.log("\nProving the database can be recreated from scratch...");
runResetWithWindowsStorageTolerance();

console.log("\nFinal local runtime status:");
runSupabase(["status"], { workdir: runtimeRoot });
verifyDatabaseMarkers();

console.log("\nTALVO_LOCAL_RUNTIME_READY");
console.log("The disposable local database was rebuilt from the verified runtime baseline plus the four post-baseline migrations.");
console.log("No production row data was copied and no remote database was mutated by this script.");
