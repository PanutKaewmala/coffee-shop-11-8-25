import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { loadBootstrap, buildBootstrap, adaptBaseline, freshTargetSql, ledgerAssertionSql, ledgerRows, postconditionsSql } from "./lib/talvo-bootstrap.mjs";
import { assertLocalContainer, localSql } from "./lib/talvo-bootstrap-local.mjs";

// Explicitly destructive ONLY to the labeled disposable local runtime. No URL,
// credentials, arbitrary database or environment-selected connection is accepted.
assertLocalContainer();
const plan = loadBootstrap();
const { payload } = buildBootstrap(plan);
const prepared = spawnSync(process.execPath, ["scripts/reset-talvo-local-runtime.mjs", "--prepare-only"], { stdio: "inherit" });
assert.equal(prepared.status, 0, "Could not prepare the empty local Supabase platform");
function sql(input, { error, transaction = false } = {}) {
  const result = localSql(input, { transaction });
  if (error) {
    assert.notEqual(result.status, 0, "Expected SQL rejection");
    assert.ok(result.stderr.includes(error), result.stderr);
  } else assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const fresh = () => sql(`begin read only; ${freshTargetSql} rollback;`);
fresh();
console.log("PASS empty Supabase platform, including absence of application CLI history");

const injectAfter = (source, extra) => {
  const start = payload.indexOf(source);
  assert.ok(start >= 0, "Fault injection must target actual source bytes");
  const end = start + source.length;
  return Buffer.concat([payload.subarray(0, end), Buffer.from(`\n${extra}\n`), payload.subarray(end)]);
};
for (const source of plan.sources) {
  const bytes = source === plan.sources[0] ? Buffer.from(adaptBaseline(source.bytes)) : source.bytes;
  const broken = injectAfter(bytes, "do $fault$ begin raise exception 'INJECTED_BOOTSTRAP_FAILURE'; end $fault$;");
  sql(broken, { transaction: true, error: "INJECTED_BOOTSTRAP_FAILURE" });
  fresh(); // Every application object and ledger entry must have rolled back.
  console.log(`PASS atomic rollback after ${source.version}`);
}

const branchSource = plan.sources.find((s) => s.version === "20260922193511");
// The real empty-branch DO block must enforce READ COMMITTED. Unlike lock
// observation alone (earlier DDL can hold the same modes), this distinguishes
// actually executing the migration from emitting its ledger/step marker only.
const repeatableRead = payload.toString().replace("set transaction isolation level read committed, read write;", "set transaction isolation level repeatable read, read write;");
sql(repeatableRead, { transaction: true, error: "TALVO_BRANCH_BOOTSTRAP_REQUIRES_READ_COMMITTED" });
fresh();
// Prove this behavioral assertion detects deliberate omission. Roll back the
// mutated test payload explicitly so it cannot become our successful bootstrap.
const skipped = repeatableRead.replace(branchSource.bytes.toString(), "-- deliberately omitted branch source\n") + "\nrollback;\n";
assert.notEqual(skipped, repeatableRead);
sql(skipped, { transaction: true });
fresh();
console.log("PASS real zero-branch migration execution proven by isolation guard; skipping its body defeats that guard and is detected by the test");

const supply = plan.sources.find((s) => s.version === "20260817100000");
const conflicting = injectAfter(supply.bytes, "insert into talvo.schema_revisions(version,source_sha256) values ('20260805083001',repeat('0',64));");
sql(conflicting, { transaction: true, error: "duplicate key" });
fresh();
console.log("PASS conflicting ledger hash rejects and rolls back instead of overwriting");

// Existing partial state is neither removed nor repaired by the runner.
sql("create table public.bootstrap_unexpected(value integer); insert into public.bootstrap_unexpected values(42);");
sql(payload, { transaction: true, error: "BOOTSTRAP_TARGET_NOT_FRESH" });
assert.equal(sql("select value from public.bootstrap_unexpected;"), "42");
assert.equal(sql("select to_regnamespace('talvo') is null;"), "t");
sql("drop table public.bootstrap_unexpected;");
fresh();
sql("create schema talvo;");
sql(payload, { transaction: true, error: "BOOTSTRAP_TARGET_NOT_FRESH" });
sql("drop schema talvo;");
fresh();

// Supabase's real empty migration ledger is allowed, unexplained rows are not.
const cliTableExisted = sql("select to_regclass('supabase_migrations.schema_migrations') is not null;") === "t";
if (!cliTableExisted) sql("create schema if not exists supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key);");
sql("insert into supabase_migrations.schema_migrations(version) values ('19990101000000');");
sql(payload, { transaction: true, error: "BOOTSTRAP_UNEXPLAINED_CLI_HISTORY" });
sql("delete from supabase_migrations.schema_migrations where version='19990101000000';");
if (!cliTableExisted) sql("drop table supabase_migrations.schema_migrations;");
fresh();
console.log("PASS partial schema, existing application objects and unexplained CLI history fail closed");

const applied = sql(payload, { transaction: true });
assert.ok(applied.includes("BOOTSTRAP_APPLIED:20260922193511"));
assert.ok(applied.includes("BOOTSTRAP_VERIFIED_BEFORE_COMMIT"));
sql(`begin read only; ${postconditionsSql(plan)} rollback;`);
const rows = sql("select version||'|'||source_sha256 from talvo.schema_revisions order by version;").split("\n");
assert.deepEqual(rows, ledgerRows(plan).map((row) => row.join("|")).sort());
assert.equal(sql("select (select count(*) from public.shops),(select count(*) from public.branch),(select count(*) from talvo.inventory_locations);"), "0|0|0");
assert.equal(sql("select count(*) from talvo.schema_revisions where applied_at is not null;"), "8");
assert.equal(sql("select string_agg(column_name||':'||data_type||':'||is_nullable,',' order by ordinal_position) from information_schema.columns where table_schema='talvo' and table_name='schema_revisions';"),
  "version:text:NO,source_sha256:text:NO,applied_at:timestamp with time zone:NO");
sql(`begin; update talvo.schema_revisions set source_sha256=repeat('0',64) where version='20260805083001'; ${ledgerAssertionSql(plan)} rollback;`, { error: "BOOTSTRAP_LEDGER_MISMATCH" });
sql(`begin read only; ${ledgerAssertionSql(plan)} rollback;`);
sql(payload, { transaction: true, error: "BOOTSTRAP_TARGET_NOT_FRESH" });
console.log("PASS full canonical reconstruction committed: real zero-branch execution, eight exact source hashes, zero application rows, current usable-stock RPCs, ledger-conflict detection and repeat rejection");
