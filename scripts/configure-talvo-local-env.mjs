import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const backupPath = path.join(root, ".env.local.production-backup");
const runtimeRoot = path.join(root, ".talvo-local-runtime");
const supabaseCliVersion = "2.95.3";

function fail(message) {
  console.error(`\nTALVO local env setup failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(envPath)) fail(".env.local is missing");
if (!fs.existsSync(backupPath)) fail(".env.local.production-backup is missing");
if (!fs.existsSync(runtimeRoot)) fail(".talvo-local-runtime is missing; build the local runtime first");

const env = { ...process.env, SUPABASE_WORKDIR: runtimeRoot };
const npxArgs = ["--yes", `supabase@${supabaseCliVersion}`, "status", "-o", "env"];

const result = process.platform === "win32"
  ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx ${npxArgs.join(" ")}`], {
      cwd: root,
      env,
      encoding: "utf8",
      shell: false,
    })
  : spawnSync("npx", npxArgs, {
      cwd: root,
      env,
      encoding: "utf8",
      shell: false,
    });

if (result.error) fail(result.error.message);
if (result.status !== 0) {
  const safeError = String(result.stderr || result.stdout || "").replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "[hidden-key]");
  console.error(safeError.trim());
  fail("could not read local Supabase status");
}

function parseStatusEnv(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

const status = parseStatusEnv(String(result.stdout || ""));
const apiUrl = status.get("API_URL") || status.get("SUPABASE_URL");
const anonKey = status.get("ANON_KEY") || status.get("PUBLISHABLE_KEY");
const serviceRoleKey = status.get("SERVICE_ROLE_KEY") || status.get("SECRET_KEY");

if (!apiUrl || !anonKey || !serviceRoleKey) {
  fail("local Supabase status did not expose API_URL, ANON_KEY/PUBLISHABLE_KEY, and SERVICE_ROLE_KEY/SECRET_KEY");
}
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/.test(apiUrl)) {
  fail(`refusing to write a non-local Supabase URL: ${apiUrl}`);
}

const replacements = new Map([
  ["NEXT_PUBLIC_SUPABASE_URL", apiUrl],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
  ["TALVO_LOCAL_RUNTIME", "1"],
]);

const original = fs.readFileSync(envPath, "utf8");
const newline = original.includes("\r\n") ? "\r\n" : "\n";
const seen = new Set();
const out = [];

for (const line of original.split(/\r?\n/)) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (!match || !replacements.has(match[1])) {
    out.push(line);
    continue;
  }

  const key = match[1];
  if (seen.has(key)) continue;
  out.push(`${key}=${replacements.get(key)}`);
  seen.add(key);
}

for (const [key, value] of replacements) {
  if (!seen.has(key)) out.push(`${key}=${value}`);
}

fs.writeFileSync(envPath, out.join(newline), "utf8");

const check = fs.readFileSync(envPath, "utf8");
for (const [key, value] of replacements) {
  if (!check.includes(`${key}=${value}`)) fail(`failed to persist ${key}`);
}

console.log("TALVO_LOCAL_ENV_READY");
console.log(`NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`);
console.log("NEXT_PUBLIC_SUPABASE_ANON_KEY=[local key configured]");
console.log("SUPABASE_SERVICE_ROLE_KEY=[local key configured]");
console.log("Production env backup remains at .env.local.production-backup");
