import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadBootstrap, buildBootstrap, freshTargetSql, postconditionsSql } from "./lib/talvo-bootstrap.mjs";
import { assertLocalEngine, localSql } from "./lib/talvo-bootstrap-local.mjs";

const root = process.cwd();
const sourceSupabaseDir = path.join(root, "supabase");
const sourceConfigPath = path.join(sourceSupabaseDir, "config.toml");
const runtimeRoot = path.join(root, ".talvo-local-runtime");
const runtimeSupabaseDir = path.join(runtimeRoot, "supabase");
const runtimeMigrationsDir = path.join(runtimeSupabaseDir, "migrations");

// Pin the CLI used by this reproducible local-runtime script instead of
// depending on whatever global Supabase CLI happens to be installed.
const supabaseCliVersion = "2.95.3";
const localProjectId = "coffee-saas-v1-local-runtime";
if (process.argv.slice(2).some((arg) => arg !== "--prepare-only")) throw new Error("Only --prepare-only is supported; no remote target options");

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
  // start/status output contains local API keys; never forward it to logs.
  const result = spawnNpxSupabase(args, { workdir, capture: true });
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
  const knownStorageRestartTimeout =
    /storage\/v1\/bucket/i.test(output) &&
    /context deadline exceeded|Client\.Timeout exceeded/i.test(output);

  if (knownStorageRestartTimeout) {
    console.warn(
      "\nSupabase reported a Windows storage health-check timeout after platform reset.\n" +
        "Continuing only if the shared empty-platform gate succeeds before application DDL.",
    );
    sleep(5000);
    return;
  }

  fail(`supabase ${args.join(" ")} exited with code ${result.status}`);
}

requireFile(sourceConfigPath);
// Verify every source before any local reset. Never consume connection URLs.
const plan = loadBootstrap(root);
const built = buildBootstrap(plan);
assertLocalEngine();

if (path.resolve(runtimeRoot) !== path.join(path.resolve(root), ".talvo-local-runtime")) {
  fail("Runtime reset target is outside the workspace");
}
fs.rmSync(runtimeRoot, { recursive: true, force: true });
fs.mkdirSync(runtimeMigrationsDir, { recursive: true });

let config = fs.readFileSync(sourceConfigPath, "utf8");
config = config.replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${localProjectId}"`);
config = config.replace(/(\[db\.seed\][\s\S]*?^enabled\s*=\s*)true/m, "$1false");
fs.writeFileSync(path.join(runtimeSupabaseDir, "config.toml"), config);
fs.writeFileSync(path.join(runtimeSupabaseDir, "seed.sql"), "-- Intentionally empty. Local test fixtures are added separately.\n");

console.log(`Canonical bootstrap source commit: ${plan.commit}`);
console.log(`Payload SHA-256: ${built.payloadSha256}`);
console.log("Preparing an empty disposable local Supabase platform (no application migrations)...");
runSupabase(["start"], { workdir: runtimeRoot });
runResetWithWindowsStorageTolerance();

const fresh = localSql(`begin read only; ${freshTargetSql} rollback;`);
if (fresh.status !== 0) fail(fresh.stderr || "Local platform is not empty");
if (process.argv.includes("--prepare-only")) {
  console.log("TALVO_LOCAL_EMPTY_PLATFORM_READY");
  process.exit(0);
}
const applied = localSql(built.payload, { transaction: true });
if (applied.status !== 0) fail(applied.stderr || "Local bootstrap transaction failed");
process.stdout.write(applied.stdout);
const verified = localSql(`begin read only; ${postconditionsSql(plan)} rollback;`);
if (verified.status !== 0) fail(verified.stderr || "Local post-commit verification failed");
fs.writeFileSync(path.join(runtimeRoot, "bootstrap-receipt.json"), JSON.stringify({
  sourceCommit: plan.commit, baselineSourceSha256: plan.manifest.baseline.sha256,
  adaptation: plan.manifest.adaptation, adaptedBaselineSha256: built.adaptedBaselineSha256,
  payloadSha256: built.payloadSha256, ledger: [plan.manifest.baseline, ...plan.manifest.migrations],
}, null, 2) + "\n");
console.log("TALVO_LOCAL_RUNTIME_READY: exact eight-row ledger, empty application tables, current schema verified");
