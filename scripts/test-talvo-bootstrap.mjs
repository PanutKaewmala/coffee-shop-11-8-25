import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadBootstrap, validateManifest, buildBootstrap, adaptBaseline, validateSql, ledgerRows, readGitBlob, sha256 } from "./lib/talvo-bootstrap.mjs";
import { localSql, assertLocalEndpoint } from "./lib/talvo-bootstrap-local.mjs";

const root = process.cwd();
const plan = loadBootstrap(root);
const paths = plan.manifest.migrations.map((e) => e.path);
const versions = ["20260807090000", "20260817100000", "20260922193511", "20260819180000", "20260819180100", "20260910042652", "20260921142010", "20261004050634", "20261004052000", "20261004052509"];
assert.deepEqual(plan.manifest.migrations.map((e) => e.version), versions);
assert.equal(plan.manifest.baseline.sha256, "f02f683252c165e7508a640d5d6e01f17f3f73c28b76a33e8e5c3e341a2e520c");
assert.equal(plan.manifest.baseline.version, "20260805083001");
assert.equal(plan.manifest.baseline.kind, "baseline-artifact");
for (const source of plan.sources) {
  assert.equal(sha256(readGitBlob(root, plan.commit, source.path)), source.sha256);
  assert.ok(source.bytes.equals(readGitBlob(root, plan.commit, source.path)));
}
assert.throws(() => readGitBlob(root, plan.commit, "supabase/migrations/missing.sql"), /Missing committed source/);
assert.throws(() => readGitBlob(root, "HEAD", paths[0]), /immutable/);
assert.throws(() => readGitBlob(root, plan.commit, "supabase/../secrets"), /traversal/);

let mutations = 0;
for (const change of [
  (m) => m.migrations.reverse(),
  (m) => { [m.migrations[2], m.migrations[3]] = [m.migrations[3], m.migrations[2]]; },
  (m) => m.migrations.pop(),
  (m) => m.migrations.push({ ...m.migrations[0] }),
  (m) => { m.migrations[1].version = m.migrations[0].version; },
  (m) => { m.migrations[1].path = m.migrations[0].path; },
  (m) => { m.migrations[0].sha256 = "0".repeat(64); },
  (m) => { m.baseline.sha256 = "0".repeat(64); },
  (m) => { m.baseline.version = m.baseline.cutoff; },
  (m) => { m.adaptation = "unreviewed"; },
]) {
  const altered = structuredClone(plan.manifest); change(altered);
  assert.throws(() => validateManifest(altered, paths)); mutations++;
}
assert.throws(() => validateManifest(plan.manifest, [...paths, "supabase/migrations/20261001000000_unreviewed.sql"]), /unreviewed/);
assert.throws(() => validateManifest(plan.manifest, paths.slice(1)), /Missing/);

const built = buildBootstrap(plan);
const tampered = { ...plan, sources: plan.sources.map((s, i) => i === 1 ? { ...s, bytes: Buffer.concat([s.bytes, Buffer.from("-- tampered")]) } : s) };
assert.throws(() => buildBootstrap(tampered), /AssertionError/);
for (const database of ["postgresql://fake:fake@remote.invalid/postgres", "other", "postgres -h remote.invalid"]) {
  assert.throws(() => localSql("select 1;", { database }), /Invalid disposable database name/);
}
for (const endpoint of ["npipe:////./pipe/dockerDesktopLinuxEngine", "unix:///var/run/docker.sock"]) assertLocalEndpoint(endpoint);
for (const endpoint of ["tcp://remote.invalid:2375", "ssh://remote.invalid", "npipe:////remote.invalid/pipe/docker_engine", "unix://remote.invalid/socket", ""]) {
  assert.throws(() => assertLocalEndpoint(endpoint), /non-local Docker/);
}
const payload = built.payload.toString();
let cursor = -1;
for (const source of plan.sources.slice(1)) {
  const index = built.payload.indexOf(source.bytes);
  assert.ok(index > cursor, `Canonical bytes executed in order: ${source.version}`); cursor = index;
  assert.ok(built.payload.indexOf(`values ('${source.version}','${source.sha256}')`) > index + source.bytes.length - 1, "Record after source executes");
}
assert.ok(payload.indexOf("create table talvo.schema_revisions") < payload.indexOf("insert into talvo.schema_revisions"));
assert.equal((payload.match(/insert into talvo.schema_revisions\(/g) ?? []).length, 11);
assert.equal(ledgerRows(plan).length, 11);
assert.match(payload, /set transaction isolation level read committed, read write;/);
assert.match(payload, /BOOTSTRAP_LEDGER_MISMATCH/);
assert.match(payload, /TALVO_BRANCH_BOOTSTRAP_REQUIRES_READ_COMMITTED/);
assert.match(payload, /BOOTSTRAP_UNEXPLAINED_CLI_HISTORY/);
assert.ok(payload.indexOf("BOOTSTRAP_TARGET_NOT_FRESH") < payload.indexOf("CREATE TYPE public.contact_category"));
assert.doesNotMatch(payload, /insert into talvo.schema_revisions[^;]*on conflict/i, "Ledger must not overwrite hashes");
const adapted = adaptBaseline(plan.sources[0].bytes);
const grants = (sql) => sql.split(/\r?\n/).filter((line) => /^(GRANT|REVOKE)\b/.test(line));
assert.deepEqual(grants(adapted), grants(plan.sources[0].bytes.toString()), "All explicit application privileges preserved byte-for-byte per line");
assert.doesNotMatch(adapted, /^\\(?:un)?restrict|^CREATE SCHEMA public;|^ALTER DEFAULT PRIVILEGES/gm);
assert.match(adapted, /SET check_function_bodies = false;/);
assert.ok(payload.indexOf("set local check_function_bodies=on;") > payload.indexOf("SET check_function_bodies = false;"));
assert.ok(payload.indexOf("set local check_function_bodies=on;") < payload.indexOf("-- SOURCE"));
assert.throws(() => adaptBaseline(Buffer.from(plan.sources[0].bytes.toString().replace("CREATE SCHEMA public;", "CREATE SCHEMA other;"))), /adaptation/);
for (const sql of ["commit;", "begin;", "rollback;", "end;", "start transaction;", "savepoint x;", "prepare transaction 'x';", "vacuum;", "create index concurrently x on t(id);", "alter system set x='x';", "copy t from stdin;", "\\connect other\n", "set transaction read only;", "select 'unterminated;", "do $$ begin commit; end $$;", "select '\\'; commit;"]) {
  assert.throws(() => validateSql(sql), undefined, sql);
}
validateSql("-- commit;\n/* rollback; /* nested */ */ create function x() returns void language plpgsql as $$ begin return; end $$;");

// A temporary checkout reads the SAME existing Git object database. No commits,
// branches, indexes, worktrees or repository source files are changed by this test.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "talvo-bootstrap-unit-"));
try {
  fs.writeFileSync(path.join(temporary, ".git"), `gitdir: ${execFileSync("git", ["rev-parse", "--absolute-git-dir"], { encoding: "utf8" }).trim()}\n`);
  for (const relative of ["supabase/bootstrap/manifest.json", "supabase/local-runtime/.baseline-cutoff", "supabase/local-runtime/production-public-baseline.sha256", ...plan.sources.map((e) => e.path)]) {
    const destination = path.join(temporary, relative); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(path.join(root, relative), destination);
  }
  for (const newline of ["\n", "\r\n"]) {
    for (const source of plan.sources) fs.writeFileSync(path.join(temporary, source.path), source.bytes.toString().replace(/\r?\n/g, newline));
    assert.ok(buildBootstrap(loadBootstrap(temporary)).payload.equals(built.payload), "Checkout line endings cannot affect executed bytes or hashes");
  }
  const first = path.join(temporary, paths[0]);
  fs.appendFileSync(first, "-- unreviewed edit\n");
  assert.throws(() => loadBootstrap(temporary), /Uncommitted source change/);
  fs.unlinkSync(first);
  assert.throws(() => loadBootstrap(temporary), /ENOENT/);
  fs.writeFileSync(first, plan.sources[1].bytes);
  fs.writeFileSync(path.join(temporary, "supabase/migrations/20261001000000_unreviewed.sql"), "select 1;");
  assert.throws(() => loadBootstrap(temporary), /unreviewed/);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

const library = fs.readFileSync("scripts/lib/talvo-bootstrap.mjs", "utf8");
const transport = fs.readFileSync("scripts/lib/talvo-bootstrap-local.mjs", "utf8");
const reset = fs.readFileSync("scripts/reset-talvo-local-runtime.mjs", "utf8");
for (const source of [library, transport, reset]) assert.doesNotMatch(source, /PRODUCTION_DATABASE_URL|STAGING_DATABASE_URL|udgxrvtbhytqncmyhmiv|qyospaplvrfpdoyiwpoy|--db-url|--linked|process\.env\.PG/);
assert.match(transport, /"-h", "\/var\/run\/postgresql"/);
assert.match(transport, /assertLocalContainer\(\);/);
assert.match(transport, /"--single-transaction"/);
assert.match(transport, /"ON_ERROR_STOP=1"/);
assert.doesNotMatch(reset, /postBaselineMigrations|copyFileSync/);
assert.match(reset, /buildBootstrap\(plan\)/);
assert.match(reset, /localSql\(built.payload, \{ transaction: true \}\)/);
console.log(`PASS canonical bootstrap: source blobs, CRLF/LF independence, adaptation/ACLs, manifest-derived ledger, transaction order, local-only transport; ${mutations} deliberate manifest mutations rejected`);
