import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// A reviewed contract fingerprint, not a second execution-order list. Changing
// order, adaptation or sources requires an explicit contract/test review.
const reviewedManifestHash = "ac54783804ff9ed67bc32794a5fe899ce64dc634ad169864ea94dc079196119d";
export const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

export function readGitBlob(root, commit, sourcePath) {
  assert.match(commit, /^[0-9a-f]{40}$/, "Source must be an immutable Git commit");
  assert.match(sourcePath, /^supabase\/[a-zA-Z0-9_./-]+$/);
  assert.ok(!sourcePath.split("/").includes(".."), "Source path traversal");
  try { return git(root, ["show", `${commit}:${sourcePath}`]); }
  catch { throw new Error(`Missing committed source: ${sourcePath}`); }
}

export function validateManifest(manifest, migrationPaths) {
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.adaptation, "supabase-public-v1");
  assert.equal(manifest.baseline.kind, "baseline-artifact");
  const entries = [manifest.baseline, ...manifest.migrations];
  assert.equal(new Set(entries.map((e) => e.version)).size, entries.length, "Duplicate version");
  assert.equal(new Set(entries.map((e) => e.path)).size, entries.length, "Duplicate path");
  for (const entry of entries) {
    assert.match(entry.version, /^\d{14}$/);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  }
  for (const entry of manifest.migrations) {
    assert.match(entry.path, new RegExp(`^supabase/migrations/${entry.version}_[a-z0-9_]+\\.sql$`));
    assert.ok(entry.version > manifest.baseline.cutoff, "Migration must follow cutoff");
  }
  const discovered = migrationPaths.filter((p) => {
    const name = p.split("/").at(-1);
    const version = name.match(/^(\d{8}|\d{14})_[a-zA-Z0-9_]+\.sql$/)?.[1];
    assert.ok(version, `Ambiguous migration filename: ${name}`);
    return version.padEnd(14, "0") > manifest.baseline.cutoff;
  });
  assert.deepEqual([...new Set(discovered)].sort(), manifest.migrations.map((e) => e.path).sort(),
    "Missing or unreviewed post-cutoff migration");
  assert.equal(sha256(JSON.stringify(manifest)), reviewedManifestHash, "Reviewed manifest contract changed (including execution order)");
}

export function loadBootstrap(root = process.cwd()) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "supabase/bootstrap/manifest.json"), "utf8"));
  const commit = git(root, ["rev-parse", "HEAD"]).toString().trim();
  const tracked = git(root, ["ls-tree", "-r", "--name-only", commit, "--", "supabase/migrations"]).toString().trim().split(/\r?\n/);
  const checkedOut = fs.readdirSync(path.join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).map((n) => `supabase/migrations/${n}`);
  validateManifest(manifest, [...new Set([...tracked, ...checkedOut])]);
  assert.equal(fs.readFileSync(path.join(root, "supabase/local-runtime/.baseline-cutoff"), "utf8").trim(), manifest.baseline.cutoff);
  assert.equal(fs.readFileSync(path.join(root, "supabase/local-runtime/production-public-baseline.sha256"), "utf8").trim().split(/\s+/)[0], manifest.baseline.sha256);
  const sources = [manifest.baseline, ...manifest.migrations].map((entry) => {
    const checkout = fs.readFileSync(path.join(root, entry.path)); // missing source fails, even if Git contains it
    const bytes = readGitBlob(root, commit, entry.path);
    assert.equal(sha256(bytes), entry.sha256, `Source hash differs: ${entry.path}`);
    // Permit only Git's checkout newline conversion, never silently ignore edits.
    assert.equal(checkout.toString("utf8").replace(/\r\n/g, "\n"), bytes.toString("utf8").replace(/\r\n/g, "\n"), `Uncommitted source change: ${entry.path}`);
    assert.ok(Buffer.from(bytes.toString("utf8")).equals(bytes), "SQL source must be valid UTF-8");
    return { ...entry, bytes };
  });
  return { manifest, commit, sources };
}

// Small lexical scanner: recognize statement boundaries without confusing
// PL/pgSQL bodies, quoted strings, or nested comments with transaction commands.
// This is a fail-closed gate for the pinned sources, not a general SQL parser.
export function sqlStatements(sql) {
  const statements = [];
  let text = "";
  for (let i = 0; i < sql.length;) {
    if (sql.startsWith("--", i)) { const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end; text += " "; continue; }
    if (sql.startsWith("/*", i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      assert.equal(depth, 0, "Unterminated SQL comment"); text += " "; continue;
    }
    const dollar = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      assert.ok(end >= 0, "Unterminated dollar quote");
      // Even DO bodies cannot be allowed to end the caller's transaction.
      // ON COMMIT DROP in existing function-local temporary tables is different.
      assert.ok(!/\b(?:commit|rollback|abort)\s*(?:work|transaction|and\s+(?:no\s+)?chain)?\s*;/i.test(sql.slice(i + dollar.length, end)), "Transaction-ending command in SQL body");
      text += " __body__ "; i = end + dollar.length; continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const escapes = sql[i] === "'" && /(?:^|[^A-Za-z0-9_])e$/i.test(sql.slice(0, i));
      const quote = sql[i++]; let closed = false;
      while (i < sql.length) {
        if (escapes && sql[i] === "\\") { i += 2; continue; }
        if (sql[i++] === quote) { if (sql[i] === quote) i++; else { closed = true; break; } }
      }
      assert.ok(closed, "Unterminated SQL quote"); text += " __quoted__ "; continue;
    }
    assert.notEqual(sql[i], "\\", "psql meta-commands are forbidden in adapted SQL");
    if (sql[i] === ";") { if (text.trim()) statements.push(text.trim()); text = ""; i++; }
    else text += sql[i++];
  }
  assert.equal(text.trim(), "", "SQL must end with a statement terminator");
  return statements;
}

export function validateSql(sql, { baseline = false } = {}) {
  const statements = sqlStatements(sql);
  for (const statement of statements) {
    assert.ok(!/^(begin|start|commit|end|rollback|abort|savepoint|release|prepare|vacuum|call|copy|discard)\b/i.test(statement), "Forbidden transaction/unsupported SQL command");
    assert.ok(!/^(?:create|drop)\s+(?:database|tablespace)\b|^alter\s+system\b|\bindex\s+concurrently\b/i.test(statement), "Unsupported nontransactional SQL");
    assert.ok(!/^(?:set|reset)\b/i.test(statement) || baseline, "Migration cannot override transaction/session settings");
    assert.ok(/^(create|alter|grant|revoke|insert|update|do|set|select|comment)\b/i.test(statement), "Unreviewed SQL statement");
    if (baseline) assert.ok(!/^(insert|update|delete|copy|do|call)\b/i.test(statement), "Baseline must not contain row data or executable blocks");
  }
  return statements;
}

export function adaptBaseline(bytes) {
  const counts = { guards: 0, publicSchema: 0, defaultPrivileges: 0 };
  const sql = bytes.toString("utf8").split(/\r?\n/).filter((line) => {
    if (/^\\(?:restrict|unrestrict) [A-Za-z0-9]+$/.test(line)) { counts.guards++; return false; }
    if (line === "CREATE SCHEMA public;") { counts.publicSchema++; return false; }
    if (/^ALTER DEFAULT PRIVILEGES FOR ROLE (?:postgres|supabase_admin) IN SCHEMA public GRANT .+;$/.test(line)) { counts.defaultPrivileges++; return false; }
    return true;
  }).join("\n");
  assert.deepEqual(counts, { guards: 2, publicSchema: 1, defaultPrivileges: 23 }, "Baseline adaptation contract changed");
  validateSql(sql, { baseline: true });
  return sql;
}

export const freshTargetSql = `do $fresh$
begin
  if to_regnamespace('talvo') is not null then raise exception 'BOOTSTRAP_TARGET_NOT_FRESH'; end if;
  if exists (
    with recursive extension_objects(classid,objid) as (
      select classid,objid from pg_depend where refclassid='pg_extension'::regclass and deptype='e'
      union select d.classid,d.objid from pg_depend d join extension_objects e
        on e.classid=d.refclassid and e.objid=d.refobjid where d.deptype='i'
    ), objects(classid,objid) as (
      select 'pg_class'::regclass,oid from pg_class where relnamespace='public'::regnamespace
      union all select 'pg_proc'::regclass,oid from pg_proc where pronamespace='public'::regnamespace
      union all select 'pg_type'::regclass,oid from pg_type where typnamespace='public'::regnamespace
    ) select 1 from objects o where not exists(select 1 from extension_objects e where e.classid=o.classid and e.objid=o.objid)
  ) then raise exception 'BOOTSTRAP_TARGET_NOT_FRESH'; end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    if exists(select 1 from supabase_migrations.schema_migrations) then raise exception 'BOOTSTRAP_UNEXPLAINED_CLI_HISTORY'; end if;
  end if;
  if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null
    or to_regprocedure('extensions.gen_random_uuid()') is null
    or to_regprocedure('extensions.digest(bytea,text)') is null
    or (select count(*) from pg_roles where rolname in ('postgres','anon','authenticated','service_role')) <> 4
  then raise exception 'BOOTSTRAP_PLATFORM_CONTRACT_MISSING'; end if;
end $fresh$;`;

export function ledgerRows(plan) {
  return [plan.manifest.baseline, ...plan.manifest.migrations].map(({ version, sha256: hash }) => [version, hash]);
}

export function ledgerAssertionSql(plan) {
  const values = ledgerRows(plan).map(([version, hash]) => `('${version}','${hash}')`).join(",\n");
  return `do $ledger$ begin
    if (select count(*) from talvo.schema_revisions) <> 8 or exists (
      with expected(version,source_sha256) as (values ${values})
      (select version,source_sha256 from expected except select version,source_sha256 from talvo.schema_revisions)
      union all
      (select version,source_sha256 from talvo.schema_revisions except select version,source_sha256 from expected)
    ) then raise exception 'BOOTSTRAP_LEDGER_MISMATCH'; end if;
  end $ledger$;`;
}

export function postconditionsSql(plan) {
  return `${ledgerAssertionSql(plan)}
do $verify$
declare t record; populated boolean;
begin
  if to_regclass('talvo.branch_stock_minimums') is null
    or to_regprocedure('public.get_recipe_usable_stock(uuid,uuid)') is null
    or to_regprocedure('public.set_recipe_stock_minimum(uuid,uuid,text,uuid,numeric)') is null
    or to_regprocedure('public.process_pos_checkout_atomic(uuid,uuid,jsonb,text,numeric,text)') is null
    or to_regprocedure('public.create_talvo_supply_item(uuid,text,uuid,numeric,boolean,text,text)') is null
    or to_regprocedure('public.receive_talvo_supply_item(uuid,uuid,uuid,numeric,text,text,timestamp with time zone,text)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='inventory_snapshot')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='recipe_items' and column_name='supply_item_id')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='pos_idempotency' and column_name='request_hash')
  then raise exception 'BOOTSTRAP_SCHEMA_INCOMPLETE'; end if;
  if (select count(*) from talvo.units) <> 3 or (select count(*) from talvo.role_capabilities) <> 2
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='talvo' and c.relkind='r' and not c.relrowsecurity)
  then raise exception 'BOOTSTRAP_CATALOG_OR_RLS_MISMATCH'; end if;
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','talvo') and c.relkind in ('r','p')
    and not (n.nspname='talvo' and c.relname in ('units','role_capabilities','schema_revisions'))
    and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.refclassid='pg_extension'::regclass and d.deptype='e')
  loop
    execute format('select exists(select 1 from %I.%I)',t.nspname,t.relname) into populated;
    if populated then raise exception 'BOOTSTRAP_UNEXPECTED_APPLICATION_ROWS'; end if;
  end loop;
end $verify$;`;
}

export function buildBootstrap(plan) {
  const { sources, manifest } = plan;
  validateManifest(manifest, manifest.migrations.map((e) => e.path));
  assert.deepEqual(sources.map(({ bytes, ...entry }) => { assert.equal(sha256(bytes), entry.sha256); return entry; }), [manifest.baseline, ...manifest.migrations]);
  const baselineSql = adaptBaseline(sources[0].bytes);
  const parts = [Buffer.from(`set transaction isolation level read committed, read write;
set local lock_timeout='5s';
select pg_advisory_xact_lock(761304,1);
${freshTargetSql}\n${baselineSql}\n
-- Restore pg_dump session settings before validating migration function bodies.
set local check_function_bodies=on;
set local row_security=on;
set local search_path=pg_catalog,public,extensions;
set local statement_timeout='120s';
set local lock_timeout='5s';
set local idle_in_transaction_session_timeout='120s';
`)];
  let pending = [sources[0]];
  for (const entry of sources.slice(1)) {
    validateSql(entry.bytes.toString("utf8"));
    parts.push(Buffer.from(`\n-- SOURCE ${entry.version} ${entry.sha256}\n`), entry.bytes, Buffer.from("\n"));
    pending.push(entry);
    // The table's real definition is supplied only by this migration. No parallel DDL.
    if (entry.version === "20260807090000") continue;
    for (const source of pending) parts.push(Buffer.from(`insert into talvo.schema_revisions(version,source_sha256) values ('${source.version}','${source.sha256}');\n`));
    pending = [];
    parts.push(Buffer.from(`select 'BOOTSTRAP_APPLIED:${entry.version}';\n`));
  }
  parts.push(Buffer.from(`set constraints all immediate;\n${postconditionsSql(plan)}\nselect 'BOOTSTRAP_VERIFIED_BEFORE_COMMIT';\n`));
  const payload = Buffer.concat(parts);
  return { payload, payloadSha256: sha256(payload), adaptedBaselineSha256: sha256(baselineSql) };
}
