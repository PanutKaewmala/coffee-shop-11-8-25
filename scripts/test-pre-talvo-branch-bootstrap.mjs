import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";

// No remote URL, env credentials, schema reset, or production access is supported.
const project = "coffee-saas-v1-local-runtime";
const container = `supabase_db_${project}`;
const inspected = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}', container], { encoding: "utf8" });
assert.equal(inspected.status, 0, inspected.stderr);
assert.equal(inspected.stdout.trim(), project);
const database = `talvo_branch_bootstrap_test_${crypto.randomBytes(8).toString("hex")}`;
assert.match(database, /^talvo_branch_bootstrap_test_[a-f0-9]{16}$/);
const migration = fs.readFileSync("supabase/migrations/20260922193511_bootstrap_pre_talvo_branches.sql", "utf8");
const baseline = fs.readFileSync("supabase/migrations/20260817100000_talvo_supply_item_vertical_slice.sql", "utf8");
const args = ["exec", "-i", container, "psql", "-X", "-q", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"];
function sql(input, expectedError) {
  const result = spawnSync("docker", args, { input, encoding: "utf8" });
  if (expectedError) {
    assert.notEqual(result.status, 0, "Expected rejection");
    assert.ok(result.stderr.includes(expectedError), result.stderr);
  } else assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const shopA = "10000000-0000-4000-8000-000000000001";
const shopB = "10000000-0000-4000-8000-000000000002";
const branchA = "20000000-0000-4000-8000-000000000001";
const branchB = "20000000-0000-4000-8000-000000000002";
const branchC = "20000000-0000-4000-8000-000000000003";
const snapshot = () => sql(`select jsonb_build_object('branches',(select jsonb_agg(to_jsonb(b) order by id) from public.branch b),
  'locations',(select jsonb_agg(to_jsonb(l) order by id) from talvo.inventory_locations l));`);
const locationsA = `insert into talvo.inventory_locations(business_id,branch_id,kind)
  values('${shopA}','${branchA}','BRANCH_AVAILABLE'),('${shopA}','${branchA}','BRANCH_QUARANTINE');`;
const archivedSupply = `insert into talvo.supply_items(business_id,name,base_unit_id,quantity_step,is_lot_tracked,created_by,archived_at)
  values('${shopA}','Already used TALVO','10000000-0000-4000-8000-000000000001',1,true,'30000000-0000-4000-8000-000000000001',now());`;
const created = spawnSync("docker", ["exec", container, "createdb", "-U", "postgres", "-T", "template0", database], { encoding: "utf8" });
assert.equal(created.status, 0, created.stderr);
try {
  sql(migration, 'relation "public.branch" does not exist');
  // Minimal pre-TALVO public contract, then the UNMODIFIED real TALVO baseline.
  sql(`create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.shops(id uuid primary key);
    create table public.branch(id uuid primary key,shop_id uuid references public.shops(id),name text not null,is_primary boolean default false);
    create table public.shop_members(shop_id uuid,user_id uuid,role text);
    insert into public.shops values('${shopA}'),('${shopB}');
    insert into public.branch(id,shop_id,name,is_primary) values
      ('${branchA}','${shopA}','Legacy primary',true),('${branchB}','${shopA}','Legacy secondary',false),('${branchC}','${shopB}','Other tenant',true);
    ${baseline}`);
  const original = snapshot();
  const rejects = (setup, error) => {
    sql(`begin; ${setup} ${migration} commit;`, error);
    assert.equal(snapshot(), original, "failed bootstrap must leave no changes");
  };
  rejects(archivedSupply, "TALVO_BRANCH_BOOTSTRAP_SUPPLY_ITEMS_EXIST");
  rejects(archivedSupply.replace(",now());", ",null);"), "TALVO_BRANCH_BOOTSTRAP_SUPPLY_ITEMS_EXIST");
  rejects(archivedSupply.replace(",1,true,", ",1,false,").replace(",now());", ",null);"), "TALVO_BRANCH_BOOTSTRAP_SUPPLY_ITEMS_EXIST");
  rejects(`insert into talvo.inventory_locations(business_id,branch_id,kind) values('${shopA}','${branchA}','BRANCH_AVAILABLE');`, "PARTIAL_OR_UNKNOWN_STATE");
  rejects(`${locationsA} update public.branch set is_active=true where id='${branchA}';`, "PARTIAL_OR_UNKNOWN_STATE");
  rejects("update public.branch set is_active=true;", "PARTIAL_OR_UNKNOWN_STATE");
  rejects(`insert into talvo.inventory_locations(business_id,kind) values('${shopA}','CONSUMED');`, "UNEXPECTED_LOCATIONS");
  rejects(`update public.branch set shop_id=null where id='${branchA}';`, "BRANCH_WITHOUT_SHOP");
  sql(`begin isolation level repeatable read; ${migration} commit;`, "REQUIRES_READ_COMMITTED");
  sql(`begin; ${migration} do $$ begin raise exception 'FORCED_ROLLBACK'; end $$; commit;`, "FORCED_ROLLBACK");
  assert.equal(snapshot(), original, "activation and locations roll back together");

  // Competing supply creation cannot pass the empty-table preflight concurrently.
  const holder = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  const finished = new Promise((resolve, reject) => {
    holder.on("error", reject); holder.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Lock holder exited ${code}`)));
  });
  const ready = new Promise((resolve, reject) => {
    let output = "";
    holder.stdout.on("data", (chunk) => { output += chunk; if (output.includes("LOCK_READY")) resolve(); });
    holder.on("error", reject); holder.on("close", () => reject(new Error("Lock holder ended before ready")));
  });
  holder.stdin.end("begin; lock table talvo.supply_items in row exclusive mode; select 'LOCK_READY'; select pg_sleep(5); rollback;");
  await ready;
  sql(migration, "could not obtain lock");
  await finished;
  assert.equal(snapshot(), original);

  // A BEFORE trigger proves both exact locations exist BEFORE each activation.
  sql(`create function public.assert_bootstrap_order() returns trigger language plpgsql as $$ begin
    if new.is_active and (select count(distinct kind) from talvo.inventory_locations where business_id=new.shop_id
      and branch_id=new.id and kind in ('BRANCH_AVAILABLE','BRANCH_QUARANTINE')) <> 2 then raise exception 'ACTIVATED_TOO_EARLY'; end if;
    return new; end $$;
    create trigger assert_bootstrap_order before update on public.branch for each row execute function public.assert_bootstrap_order();
    ${migration}`);
  assert.equal(sql("select count(*) from public.branch where is_active"), "3");
  assert.equal(sql("select count(*) from talvo.inventory_locations"), "6");
  assert.equal(sql(`select count(*) from talvo.inventory_locations l join public.branch b on b.id=l.branch_id where b.shop_id<>l.business_id`), "0");
  assert.equal(sql(`select string_agg(name,',' order by id) from public.branch`), "Legacy primary,Legacy secondary,Other tenant");
  const complete = snapshot();
  sql(migration);
  assert.equal(snapshot(), complete, "repeat must preserve location IDs, timestamps and branch fields");
  sql(`begin; update public.branch set is_active=false where id='${branchB}'; ${migration} commit;`, "PARTIAL_OR_UNKNOWN_STATE");
  assert.equal(snapshot(), complete, "retry must not reactivate a deliberately disabled branch");
  sql(`begin; ${archivedSupply} ${migration} commit;`, "SUPPLY_ITEMS_EXIST");
  assert.equal(snapshot(), complete, "retry after TALVO use must fail closed");
  console.log("PASS branch bootstrap: real baseline, multi-tenant legacy activation, locations before activation, exact retry, unsafe-state rejection, rollback and concurrent writer protection");
} finally {
  // Only the random database created by this invocation is removed.
  const removed = spawnSync("docker", ["exec", container, "dropdb", "-U", "postgres", database], { encoding: "utf8" });
  assert.equal(removed.status, 0, removed.stderr);
}
