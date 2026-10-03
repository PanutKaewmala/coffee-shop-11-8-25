import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const workflowPath = ".github/workflows/talvo-supply-item-staging-validation.yml";
const workflow = readFileSync(workflowPath, "utf8");

assert.ok(
  workflow.includes("checked_table_name text;"),
  "The canonical verifier must use a loop variable that cannot shadow information_schema.columns.table_name",
);
assert.ok(
  workflow.includes("isc.table_schema='public' and isc.table_name='branch' and isc.column_name='is_active'"),
  "The canonical verifier must qualify information_schema column references",
);
assert.ok(
  !/^\s*table_name text;$/m.test(workflow),
  "The ambiguous table_name verifier variable must not return",
);

const doBlockPattern = /do \$([a-zA-Z0-9_]+)\$([\s\S]*?)\$\1\$;/g;
const doBlocks = [...workflow.matchAll(doBlockPattern)];
assert.ok(doBlocks.length > 0, "Expected to inspect PL/pgSQL DO blocks in the staging workflow");
for (const [, tag, body] of doBlocks) {
  assert.ok(
    !body.includes(":'"),
    `psql variables are not interpolated inside the dollar-quoted DO block $${tag}$`,
  );
}

for (const setting of [
  "talvo.recovery_shop",
  "talvo.recovery_branch",
  "talvo.recovery_other_branch",
  "talvo.recovery_owner",
  "talvo.recovery_other_owner",
]) {
  assert.ok(
    workflow.includes(`select set_config('${setting}', :`),
    `Recovery must initialize ${setting} before entering its guarded DO block`,
  );
  assert.ok(
    workflow.includes(`current_setting('${setting}')::uuid`),
    `Recovery guards must consume ${setting} through current_setting`,
  );
}

const bootstrapWorkflowPath = ".github/workflows/pre-talvo-branch-bootstrap-staging-validation.yml";
const bootstrapWorkflow = readFileSync(bootstrapWorkflowPath, "utf8");

for (const marker of [
  "workflow_dispatch:",
  "group: staging-database-mutation",
  "environment: talvo-staging",
  "APPROVED_TALVO_TARGET_SHA",
  "STAGING_DATABASE_URL",
  "TRUSTED_BOOTSTRAP_BASE_SHA: 81cf7e0506baeb664f7c3794c987f05bf5d2ad64",
  'git merge-base --is-ancestor "$TRUSTED_BOOTSTRAP_BASE_SHA" "$TARGET_SHA"',
  "20260922193511_bootstrap_pre_talvo_branches.sql",
  "Require data-empty staging baseline",
  "rollback;",
  "Prove staging unchanged",
]) {
  assert.ok(
    bootstrapWorkflow.includes(marker),
    `Pre-TALVO bootstrap staging validator must include: ${marker}`,
  );
}
assert.ok(
  !bootstrapWorkflow.includes("PRODUCTION_DATABASE_URL"),
  "Pre-TALVO bootstrap rehearsal must never receive production database credentials",
);
assert.ok(
  bootstrapWorkflow.includes('[[ "$REF_NAME" == "main" ]]'),
  "Pre-TALVO bootstrap validator must dispatch from main only",
);
assert.ok(
  bootstrapWorkflow.includes('[[ "$TARGET_SHA" == "$APPROVED_TALVO_TARGET_SHA" ]]'),
  "Pre-TALVO bootstrap validator must require the protected exact target SHA",
);
assert.ok(
  !bootstrapWorkflow.includes('git merge-base --is-ancestor "$GITHUB_SHA" "$TARGET_SHA"'),
  "Validator must not require the feature SHA to descend from the validator merge commit",
);
assert.ok(
  bootstrapWorkflow.includes("PASS staging unchanged after bootstrap rehearsal"),
  "Pre-TALVO bootstrap validator must prove rollback residue is absent",
);


const productionPreflightPath = ".github/workflows/talvo-production-rollout-preflight.yml";
const productionPreflight = readFileSync(productionPreflightPath, "utf8");

for (const marker of [
  "workflow_dispatch:",
  "group: talvo-production-database-rollout",
  "environment: talvo-production",
  "APPROVED_TALVO_TARGET_SHA",
  "PRODUCTION_DATABASE_URL",
  "TRUSTED_ROLLOUT_BASE_SHA: cb01ad6499c154b26fc172fa9dbb9c29a40ad081",
  "PRODUCTION_PROJECT_REF: udgxrvtbhytqncmyhmiv",
  "STAGING_PROJECT_REF: vgsrqrirtxxxnccactsb",
  "default_transaction_read_only=on",
  "20260807090000_atomic_pos_checkout.sql",
  "20260817100000_talvo_supply_item_vertical_slice.sql",
  "20260922193511_bootstrap_pre_talvo_branches.sql",
  "20260819180000_talvo_receive_supply_item.sql",
  "20260819180100_talvo_receive_history_hardening.sql",
  "20260910042652_sale_recipe_inventory.sql",
  "20260921142010_current_usable_stock.sql",
  "NO PRODUCTION MUTATION WAS PERFORMED",
]) {
  assert.ok(
    productionPreflight.includes(marker),
    `Production rollout preflight must include: ${marker}`,
  );
}
assert.ok(
  productionPreflight.includes('[[ "$REF_NAME" == "main" ]]'),
  "Production rollout preflight must dispatch from main only",
);
assert.ok(
  productionPreflight.includes('[[ "$TARGET_SHA" == "$APPROVED_TALVO_TARGET_SHA" ]]'),
  "Production rollout preflight must require the protected exact target SHA",
);
assert.ok(
  productionPreflight.includes('git merge-base --is-ancestor "$TRUSTED_ROLLOUT_BASE_SHA" "$TARGET_SHA"'),
  "Production rollout preflight must pin the reviewed rollout base",
);
assert.ok(
  !productionPreflight.includes("supabase db push"),
  "Production rollout preflight must never push migrations",
);
assert.ok(
  !productionPreflight.includes("apply_migration"),
  "Production rollout preflight must never apply migrations",
);
assert.ok(
  !productionPreflight.includes("STAGING_DATABASE_URL"),
  "Production rollout preflight must never receive staging database credentials",
);
assert.ok(
  !/psql[^\n]*-f\s+supabase\/migrations/i.test(productionPreflight),
  "Production rollout preflight must never execute a migration file against production",
);
assert.ok(
  productionPreflight.includes("to_regclass('supabase_migrations.schema_migrations') is null"),
  "Production rollout preflight must fail closed if migration history unexpectedly appears",
);


const productionRehearsalPath = ".github/workflows/talvo-production-rollout-rehearsal.yml";
const productionRehearsal = readFileSync(productionRehearsalPath, "utf8");

for (const marker of [
  "workflow_dispatch:",
  "group: talvo-production-database-rollout",
  "environment: talvo-production",
  "REHEARSE_TALVO_PRODUCTION",
  "APPROVED_TALVO_TARGET_SHA",
  "PRODUCTION_DATABASE_URL",
  "TRUSTED_ROLLOUT_BASE_SHA: d46a7cb276dddf0b135b2681e1fc1eb0207b8005",
  "begin isolation level read committed;",
  "set local lock_timeout = '3s';",
  "in share row exclusive mode nowait;",
  "insert into talvo.schema_revisions",
  "rollback;",
  "PASS TALVO production rollout rehearsal rolled back cleanly",
  "PASS production returned to reviewed pre-TALVO state",
]) {
  assert.ok(
    productionRehearsal.includes(marker),
    `Production rollout rehearsal must include: ${marker}`,
  );
}
assert.ok(
  productionRehearsal.includes('[[ "$REF_NAME" == "main" ]]'),
  "Production rehearsal must dispatch from main only",
);
assert.ok(
  productionRehearsal.includes('[[ "$TARGET_SHA" == "$APPROVED_TALVO_TARGET_SHA" ]]'),
  "Production rehearsal must require the protected exact target SHA",
);
assert.ok(
  !productionRehearsal.includes("supabase db push"),
  "Production rehearsal must not use db push",
);
assert.ok(
  !productionRehearsal.includes("apply_migration"),
  "Production rehearsal must not use the Supabase apply-migration action",
);
assert.ok(
  !productionRehearsal.includes("STAGING_DATABASE_URL"),
  "Production rehearsal must never receive staging database credentials",
);
assert.ok(
  !/^\s*commit;\s*$/mi.test(productionRehearsal),
  "Production rehearsal must never commit its transaction",
);
assert.ok(
  productionRehearsal.indexOf("20260807090000_atomic_pos_checkout.sql") <
    productionRehearsal.indexOf("20260817100000_talvo_supply_item_vertical_slice.sql") &&
    productionRehearsal.indexOf("20260817100000_talvo_supply_item_vertical_slice.sql") <
    productionRehearsal.indexOf("20260922193511_bootstrap_pre_talvo_branches.sql") &&
    productionRehearsal.indexOf("20260922193511_bootstrap_pre_talvo_branches.sql") <
    productionRehearsal.indexOf("20260819180000_talvo_receive_supply_item.sql") &&
    productionRehearsal.indexOf("20260819180000_talvo_receive_supply_item.sql") <
    productionRehearsal.indexOf("20260819180100_talvo_receive_history_hardening.sql") &&
    productionRehearsal.indexOf("20260819180100_talvo_receive_history_hardening.sql") <
    productionRehearsal.indexOf("20260910042652_sale_recipe_inventory.sql") &&
    productionRehearsal.indexOf("20260910042652_sale_recipe_inventory.sql") <
    productionRehearsal.indexOf("20260921142010_current_usable_stock.sql"),
  "Production rehearsal must keep the reviewed explicit rollout order",
);


const productionApplyPath = ".github/workflows/talvo-production-rollout-apply.yml";
const productionApply = readFileSync(productionApplyPath, "utf8");

for (const marker of [
  "workflow_dispatch:",
  "group: talvo-production-database-rollout",
  "environment: talvo-production",
  "APPLY_TALVO_PRODUCTION",
  "APPROVED_TALVO_TARGET_SHA",
  "PRODUCTION_DATABASE_URL",
  "TRUSTED_ROLLOUT_BASE_SHA: be51e0f0b7541ef2f2a8dd63c8df0bfeb43be79b",
  "--single-transaction",
  "set transaction isolation level read committed;",
  "set local lock_timeout = '3s';",
  "in share row exclusive mode nowait;",
  "TALVO_EXPECTED_COUNTS",
  "insert into talvo.schema_revisions",
  "PASS TALVO production rollout transaction verified before commit",
  "PASS TALVO production rollout committed and verified",
  "Classify production state after any failure",
]) {
  assert.ok(
    productionApply.includes(marker),
    `Production rollout apply workflow must include: ${marker}`,
  );
}
assert.ok(
  productionApply.includes('[[ "$REF_NAME" == "main" ]]'),
  "Production rollout apply must dispatch from main only",
);
assert.ok(
  productionApply.includes('[[ "$TARGET_SHA" == "$APPROVED_TALVO_TARGET_SHA" ]]'),
  "Production rollout apply must require the protected exact target SHA",
);
assert.ok(
  productionApply.includes('echo "TALVO_IDENTITY_VALIDATED=true" >> "$GITHUB_ENV"'),
  "Production rollout apply must classify post-state only after exact production identity validation",
);
assert.ok(
  !productionApply.includes("supabase db push"),
  "Production rollout apply must not use unbounded db push",
);
assert.ok(
  !productionApply.includes("apply_migration"),
  "Production rollout apply must not use an unreviewed migration action",
);
assert.ok(
  !productionApply.includes("STAGING_DATABASE_URL"),
  "Production rollout apply must never receive staging database credentials",
);
assert.ok(
  !/^\s*commit;\s*$/mi.test(productionApply),
  "Production rollout apply must rely on psql --single-transaction rather than embedded COMMIT statements",
);
assert.ok(
  productionApply.indexOf("20260807090000_atomic_pos_checkout.sql") <
    productionApply.indexOf("20260817100000_talvo_supply_item_vertical_slice.sql") &&
    productionApply.indexOf("20260817100000_talvo_supply_item_vertical_slice.sql") <
    productionApply.indexOf("20260922193511_bootstrap_pre_talvo_branches.sql") &&
    productionApply.indexOf("20260922193511_bootstrap_pre_talvo_branches.sql") <
    productionApply.indexOf("20260819180000_talvo_receive_supply_item.sql") &&
    productionApply.indexOf("20260819180000_talvo_receive_supply_item.sql") <
    productionApply.indexOf("20260819180100_talvo_receive_history_hardening.sql") &&
    productionApply.indexOf("20260819180100_talvo_receive_history_hardening.sql") <
    productionApply.indexOf("20260910042652_sale_recipe_inventory.sql") &&
    productionApply.indexOf("20260910042652_sale_recipe_inventory.sql") <
    productionApply.indexOf("20260921142010_current_usable_stock.sql"),
  "Production rollout apply must keep the reviewed explicit rollout order",
);

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
