import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

assert.ok(
  existsSync(".github/workflows/talvo-staging-connection-check.yml"),
  "The fresh staging connection check must remain available",
);
for (const obsoleteWorkflow of [
  "pre-talvo-branch-bootstrap-staging-validation.yml",
  "supabase-schema-dump-review.yml",
  "supabase-staging-schema-bootstrap.yml",
  "talvo-production-rollout-apply.yml",
  "talvo-production-rollout-preflight.yml",
  "talvo-production-rollout-rehearsal.yml",
  "talvo-receive-supply-item-staging-validation-v3.yml",
  "talvo-supply-item-staging-validation.yml",
]) {
  assert.ok(!existsSync(`.github/workflows/${obsoleteWorkflow}`), `Obsolete workflow must remain deleted: ${obsoleteWorkflow}`);
}

const connectionCheck = readFileSync(".github/workflows/talvo-staging-connection-check.yml", "utf8");
assert.match(connectionCheck, /on:\s+workflow_dispatch:\s+permissions:/, "Connection check must be manual only");
assert.match(connectionCheck, /^permissions: \{\}$/m, "Connection check needs no repository permissions");
assert.match(connectionCheck, /environment: talvo-staging/, "Connection check must use the staging environment");
assert.deepEqual(
  [...connectionCheck.matchAll(/secrets\.([A-Z_]+)/g)].map((match) => match[1]),
  ["STAGING_DATABASE_URL"],
  "Connection check must receive only staging database credentials",
);
for (const marker of [
  '[[ "$GITHUB_REF" == "refs/heads/main" ]]',
  "${{ vars.STAGING_PROJECT_REF }}",
  "${{ vars.PRODUCTION_PROJECT_REF }}",
  'staging_ref == "qyospaplvrfpdoyiwpoy"',
  'production_ref == "udgxrvtbhytqncmyhmiv"',
  "staging_ref != production_ref",
  'p.scheme in {"postgres", "postgresql"}',
  'unquote(p.username or "") == "postgres." + staging_ref',
  "p.port == 5432",
  'p.path == "/postgres"',
  "re.search(production_pattern, raw, re.IGNORECASE)",
  'raw.count("@") == 1',
  "URI connection overrides are not allowed",
  "postgres:17.11-trixie@sha256:",
  "default_transaction_read_only=on",
  "-X -v ON_ERROR_STOP=1 -Atq",
  '[[ "$state" == "on|postgres|true|0|0|0" ]]',
  "PASS fresh staging connection verified read-only",
  "group: staging-database-mutation",
  "cancel-in-progress: false",
]) {
  assert.ok(connectionCheck.includes(marker), `Fresh staging connection check must include: ${marker}`);
}
assert.ok(!connectionCheck.includes("PRODUCTION_DATABASE_URL"), "Connection check must never use production credentials");
const connectionSqlBlocks = [...connectionCheck.matchAll(/<<'SQL'\r?\n([\s\S]*?)\r?\n\s*SQL\r?\n/g)];
assert.equal(connectionSqlBlocks.length, 1, "Connection check must use one read-only SQL session");
const connectionSql = connectionSqlBlocks[0][1].trim();
assert.ok(connectionSql.startsWith("begin read only;"));
assert.ok(connectionSql.endsWith("rollback;"));
for (const marker of [
  "current_setting('transaction_read_only')",
  "current_database()",
  "to_regnamespace('talvo') is null",
  "'pg_class'::regclass",
  "'pg_proc'::regclass",
  "'pg_type'::regclass",
  "'public'::regnamespace",
  "d.refclassid='pg_extension'::regclass and d.deptype='e'",
  "e.classid=d.refclassid and e.objid=d.refobjid",
  "d.deptype='i'",
]) {
  assert.ok(connectionSql.includes(marker), `Fresh staging catalog check must include: ${marker}`);
}
assert.ok(!/\b(create|alter|drop|insert|update|delete|truncate|commit|call|do)\b/i.test(connectionSql), "Connection SQL must not mutate the database");

// Execute the workflow's Python verbatim, rather than reimplementing its policy in JS.
function extractValidator(source) {
  const blocks = [...source.matchAll(/python3 - <<'PY'\r?\n([\s\S]*?)\r?\n\s*PY\r?\n/g)];
  assert.equal(blocks.length, 1, "Expected exactly one actual URI validator");
  return blocks[0][1].split(/\r?\n/).map((line) => line.replace(/^ {10}/, "")).join("\n");
}

const stagingRef = "qyospaplvrfpdoyiwpoy";
const productionRef = "udgxrvtbhytqncmyhmiv";
const fakePassword = "Fake%2FPass%3Aword%25Safe";
const fakeUri = `postgresql://postgres.${stagingRef}:${fakePassword}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`;
const fakeEnvironment = {
  STAGING_DATABASE_URL: fakeUri,
  STAGING_PROJECT_REF: stagingRef,
  PRODUCTION_PROJECT_REF: productionRef,
};
const validUris = [
  fakeUri,
  fakeUri.replace("aws-1-", "aws-0-"),
  fakeUri.replace("postgresql:", "postgres:") + "?sslmode=require",
  fakeUri.replace(fakePassword, "Fake%2500Password"), // libpq decodes once; this is a literal %00.
];
const invalidUris = [
  ["wrong scheme", fakeUri.replace("postgresql:", "https:")],
  ["wrong project username", fakeUri.replace(stagingRef, "aaaaaaaaaaaaaaaaaaaa")],
  ["production project username", fakeUri.replace(stagingRef, productionRef)],
  ["wrong username", fakeUri.replace("postgres.", "admin.")],
  ["wrong port", fakeUri.replace(":5432/", ":6543/")],
  ["wrong database", fakeUri.replace("/postgres", "/other_database")],
  ["invalid host", fakeUri.replace("pooler.supabase.com", "pooler.supabase.com.evil.test")],
  ["wrong region", fakeUri.replace("ap-southeast-1", "ap-southeast-2")],
  ["encoded NUL password", fakeUri.replace(fakePassword, "Fake%00Password")],
  ["NUL beside lowercase escapes", fakeUri.replace(fakePassword, "Fake%2f%00%4aPassword")],
  ["NUL beside mixed-case escapes", fakeUri.replace(fakePassword, "Fake%2F%00%4aPassword")],
  ["encoded NUL username", fakeUri.replace("postgres.", "postgres%00.")],
  ["production ref in password", fakeUri.replace(fakePassword, `Fake${productionRef}Password`)],
  ["encoded production ref", fakeUri.replace(fakePassword, [...productionRef].map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).join(""))],
  ["connection override", fakeUri + "?host=localhost"],
  ["fragment", fakeUri + "#fragment"],
  ["malformed percent escape", fakeUri.replace(fakePassword, "Fake%xyPassword")],
  ["unencoded credential separator", fakeUri.replace(fakePassword, "Fake@Password")],
];
const invalidEnvironments = [
  ["wrong staging variable", { STAGING_PROJECT_REF: "aaaaaaaaaaaaaaaaaaaa" }],
  ["wrong production variable", { PRODUCTION_PROJECT_REF: "aaaaaaaaaaaaaaaaaaaa" }],
  ["identical project variables", { PRODUCTION_PROJECT_REF: stagingRef }],
];

function assertNoCredentialOutput(output, uri = fakeUri) {
  // All URIs here are synthetic. Also check individual encoded/decoded credentials,
  // since a full-URI check alone missed the original libpq password-component leak.
  const credentials = new URL(uri);
  const values = [uri, credentials.password, credentials.username, fakePassword, "Fake/Pass:word%Safe", "FAKE_LIBPQ_STDERR"];
  for (const value of [credentials.password, credentials.username]) {
    try {
      values.push(decodeURIComponent(value));
    } catch {
      // Malformed escapes are intentional negative validator cases.
    }
  }
  for (const value of values.filter(Boolean)) {
    assert.ok(!output.includes(value), "Credential or raw connection diagnostics reached output");
  }
}

function checkValidator(source) {
  const validator = extractValidator(source);
  assert.ok(!validator.includes("unquote(raw)"), "Do not decode the full URI/password for identity checks");
  const cases = [
    ...validUris.map((uri) => ["valid staging URI", { STAGING_DATABASE_URL: uri }, true]),
    ...invalidUris.map(([label, uri]) => [label, { STAGING_DATABASE_URL: uri }, false]),
    ...invalidEnvironments.map(([label, env]) => [label, env, false]),
  ];
  for (const [label, overrides, valid] of cases) {
    const env = { ...fakeEnvironment, ...overrides };
    const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", validator], {
      env: { PATH: process.env.PATH, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), ...env },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.ifError(result.error);
    assertNoCredentialOutput(result.stdout + result.stderr, env.STAGING_DATABASE_URL);
    assert.equal(result.stdout, "", `${label}: validator must not print credentials or parsed values`);
    if (valid) {
      assert.equal(result.status, 0, `${label}: valid URI rejected`);
      assert.equal(result.stderr, "", `${label}: unexpected validator stderr`);
    } else {
      assert.notEqual(result.status, 0, `${label}: unsafe URI/environment accepted`);
      assert.match(result.stderr, /^FAIL [^\r\n]+\r?\n?$/, `${label}: error must be generic, without a traceback`);
    }
  }
  return cases.length;
}

// Run both actual Bash step bodies. The container has no network, and docker/psql
// are fakes: psql emits deliberately sensitive stdout AND stderr to test containment.
const postgresImage = connectionCheck.match(/^\s*POSTGRES_17_IMAGE: (\S+)$/m)?.[1];
assert.match(postgresImage, /^postgres:17\.11-trixie@sha256:[a-f0-9]{64}$/);
function extractSteps(source) {
  const steps = [...source.matchAll(/^ {8}run: \|\r?\n((?: {10}[^\r\n]*(?:\r?\n|$)|\r?\n)+)/gm)]
    .map((match) => match[1].split(/\r?\n/).map((line) => line.replace(/^ {10}/, "")).join("\n"));
  assert.equal(steps.length, 2, "Expected identity and connection steps only");
  return steps;
}

function runFakeStep(step, overrides = {}) {
  const env = { ...fakeEnvironment, POSTGRES_17_IMAGE: postgresImage, GITHUB_REF: "refs/heads/main", FAKE_PSQL_MODE: "success", FAKE_VALIDATOR_STATUS: "0", ...overrides };
  const driver = `
python3() { cat >/dev/null; return "$FAKE_VALIDATOR_STATUS"; }
psql() {
  [[ "$1" == "$STAGING_DATABASE_URL" ]] || return 98
  cat >/dev/null
  printf 'FAKE_LIBPQ_STDERR %s Fake/Pass:word%%Safe\\n' "$STAGING_DATABASE_URL" >&2
  case "$FAKE_PSQL_MODE" in
    success) printf 'on|postgres|true|0|0|0\\n' ;;
    nonfresh) printf 'on|postgres|true|1|0|0\\n' ;;
    unsafe-output) printf '%s\\n' "$STAGING_DATABASE_URL" ;;
    failure) printf '%s\\n' "$STAGING_DATABASE_URL"; return 2 ;;
    *) return 97 ;;
  esac
}
export -f psql
docker() { local command="\${!#}"; bash -euc "$command"; }
${step}
`;
  const result = spawnSync("docker", [
    "run", "--rm", "-i", "--network", "none",
    ...Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    "--entrypoint", "bash", postgresImage, "-s",
  ], { input: driver, encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error);
  assertNoCredentialOutput(result.stdout + result.stderr);
  assert.equal(result.stderr, "", "Workflow must suppress raw psql/libpq stderr");
  return result;
}

function checkShellSteps(source) {
  const [identityStep, databaseStep] = extractSteps(source);
  const identity = runFakeStep(identityStep);
  assert.equal(identity.status, 0);
  assert.equal(identity.stdout, "");
  const wrongBranch = runFakeStep(identityStep, { GITHUB_REF: "refs/heads/unsafe" });
  assert.notEqual(wrongBranch.status, 0);
  assert.equal(wrongBranch.stdout, "::error::Dispatch from main only\n");
  assert.notEqual(runFakeStep(identityStep, { FAKE_VALIDATOR_STATUS: "1" }).status, 0);
  const success = runFakeStep(databaseStep);
  assert.equal(success.status, 0);
  assert.equal(success.stdout, "PASS fresh staging connection verified read-only; no TALVO schema or public application objects\n");
  const failure = runFakeStep(databaseStep, { FAKE_PSQL_MODE: "failure" });
  assert.notEqual(failure.status, 0);
  assert.equal(failure.stdout, "::error::Staging database connection failed\n");
  for (const mode of ["nonfresh", "unsafe-output"]) {
    const result = runFakeStep(databaseStep, { FAKE_PSQL_MODE: mode });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "::error::Staging must be read-only, use postgres, and have no TALVO schema or public application objects\n");
  }
}

const uriCaseCount = checkValidator(connectionCheck);
checkShellSteps(connectionCheck);

// Prove that the previous false negatives now fail, without changing any files.
for (const [label, unsafe] of [
  ["hostname gate removed", connectionCheck.split(/\r?\n/).filter((line) => !line.includes("staging Session Pooler host")).join("\n")],
  ["validation helper disabled", connectionCheck.replace("if not condition:", "if False:")],
  ["parsed password printed", connectionCheck.replace("p = urlparse(raw)", "p = urlparse(raw)\n              print(p.password)")],
]) {
  assert.notEqual(unsafe, connectionCheck, `${label}: mutation must take effect`);
  assert.throws(() => checkValidator(unsafe), assert.AssertionError, `${label}: tests must detect the regression`);
}
for (const [label, unsafe] of [
  ["URI echoed", connectionCheck.replace("set -euo pipefail", 'set -euo pipefail\n          echo "$STAGING_DATABASE_URL"')],
  ["raw connection stderr forwarded", connectionCheck.replace(" 2>/dev/null <<'SQL'", " <<'SQL'")],
]) {
  assert.notEqual(unsafe, connectionCheck, `${label}: mutation must take effect`);
  assert.throws(() => checkShellSteps(unsafe), assert.AssertionError, `${label}: tests must detect the regression`);
}

console.log(`TALVO workflow contracts passed; ${uriCaseCount} actual URI validator cases, 7 isolated shell cases, and 5 regression mutations passed (fake credentials; no network)`);
