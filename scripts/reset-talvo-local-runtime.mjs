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

// The globally installed CLI on the current Windows workstation is 2.72.x.
// That release has a known SQL splitter bug: function names containing
// "atomic" can cause valid multi-statement migrations to be sent as one
// prepared statement (SQLSTATE 42601). Pin a newer CLI for this reproducible
// local-runtime script instead of depending on whatever global CLI is installed.
const supabaseCliVersion = "2.95.3";
const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";

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

function runSupabase(args, { workdir } = {}) {
  const env = { ...process.env };
  if (workdir) env.SUPABASE_WORKDIR = workdir;

  const npxArgs = ["--yes", `supabase@${supabaseCliVersion}`, ...args];
  console.log(`\n> npx --yes supabase@${supabaseCliVersion} ${args.join(" ")}`);
  const result = spawnSync(npxExecutable, npxArgs, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) fail(result.error.message);
  if (result.status !== 0) {
    fail(`supabase ${args.join(" ")} exited with code ${result.status}`);
  }
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

// Supabase CLI 2.95.x fixed the older multi-statement/"atomic" splitter bug,
// but CREATE INDEX CONCURRENTLY is not safe in its migration pipeline. Refuse
// that construct explicitly so this script fails closed if the chain changes.
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
config = config.replace(/^project_id\s*=\s*"[^"]+"/m, 'project_id = "coffee-saas-v1-local-runtime"');
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
runSupabase(["db", "reset", "--local", "--no-seed"], { workdir: runtimeRoot });

console.log("\nFinal local runtime status:");
runSupabase(["status"], { workdir: runtimeRoot });

console.log("\nTALVO_LOCAL_RUNTIME_READY");
console.log("The disposable local database was rebuilt from the verified runtime baseline plus the four post-baseline migrations.");
console.log("No production row data was copied and no remote database was mutated by this script.");
