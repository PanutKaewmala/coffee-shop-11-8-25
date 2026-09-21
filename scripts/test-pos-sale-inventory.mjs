import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";

// This harness intentionally has no connection-string or remote-target option.
const project = "coffee-saas-v1-local-runtime";
const container = `supabase_db_${project}`;
const inspected = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}', container], { encoding: "utf8" });
assert.equal(inspected.status, 0, "Start the disposable TALVO local runtime first");
assert.equal(inspected.stdout.trim(), project, "Refusing an unverified database container");
const args = ["exec", "-i", container, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
function sql(input, variables = []) {
  const result = spawnSync("docker", [...args, ...variables.flatMap(([key, value]) => ["-v", `${key}=${value}`])], { input, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function concurrentSql(input) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = ""; let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error || output)));
    child.stdin.end(input);
  });
}
const actor = sql("select id from auth.users where email='owner@demo.com';");
assert.match(actor, /^[a-f0-9-]{36}$/, "Seed the disposable local browser fixture first");
const business = crypto.randomUUID();
const branch = crypto.randomUUID();
const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
const [category, serve, menu, variant, ingredient] = ids;
sql(`begin; insert into public.shops(id,name,slug) values('${business}','Sale integration','sale-${business}');
insert into public.shop_members(shop_id,user_id,role) values('${business}','${actor}','owner');
insert into auth.users(id,email) values('34000000-0000-4000-8000-000000000005','integration-other-owner@local.invalid') on conflict(id) do nothing;
insert into public.shop_members(shop_id,user_id,role) values('${business}','34000000-0000-4000-8000-000000000005','owner');
insert into public.branch(id,shop_id,name,is_active) values('${branch}','${business}','Second integration branch',true);
insert into talvo.inventory_locations(business_id,branch_id,kind)
select '${business}',id,k.kind from public.branch cross join (values('BRANCH_AVAILABLE'),('BRANCH_QUARANTINE')) k(kind)
where shop_id='${business}';
update public.branch set is_active=true where shop_id='${business}'; commit;`);
const variables = [["talvo_business_id", business], ["talvo_actor_id", actor]];
for (const file of ["talvo_create_supply_item_integration.sql", "talvo_receive_supply_item_integration.sql", "pos_sale_inventory_integration.sql"]) {
  sql(fs.readFileSync(new URL(`../supabase/tests/${file}`, import.meta.url), "utf8"), variables);
  console.log(`PASS ${file}`);
}
// Independent transactions prove advisory-lock behavior, not merely sequential replay.
sql(`insert into public.menu_categories(id,shop_id,name) values('${category}','${business}','Concurrency');
insert into public.menu_serve_types(id,shop_id,name) values('${serve}','${business}','Test serve');
insert into public.menu(id,shop_id,category_id,name,price) values('${menu}','${business}','${category}','Concurrency coffee',60);
insert into public.menu_variants(id,shop_id,menu_id,serve_type_id,is_default) values('${variant}','${business}','${menu}','${serve}',true);
insert into public.ingredients(id,shop_id,branch_id,name,stock,unit,base_unit,is_active) values('${ingredient}','${business}','${branch}','Concurrency beans',1000,'g','g',true);
insert into public.recipe_items(shop_id,branch_id,variant_id,ingredient_id,quantity) values('${business}','${branch}','${variant}','${ingredient}',20);`);
const request = `'${business}','${branch}','[{"variant_id":"${variant}","qty":2,"sweetness":"100%"}]','cash',120,'concurrent-integration-${business}'`;
const query = `begin; select set_config('request.jwt.claim.sub','${actor}',true); set local role authenticated;
select public.process_pos_checkout_atomic(${request}); select pg_sleep(0.15); commit;`;
const responses = await Promise.all([concurrentSql(query), concurrentSql(query), concurrentSql(query)]);
const parsed = responses.map((response) => JSON.parse(response.split(/\r?\n/).find((line) => line.startsWith("{"))));
assert.deepEqual(parsed[0], parsed[1]);
assert.deepEqual(parsed[0], parsed[2]);
assert.equal(sql(`select count(*) from public.orders where shop_id='${business}';`), "1");
assert.equal(Number(sql(`select stock from public.ingredients where id='${ingredient}';`)), 960);
assert.equal(sql(`select count(*) from public.stock_logs where shop_id='${business}' and type='deduct';`), "1");
console.log("PASS three concurrent checkouts return the same order and deduct once");

// Exercise the actual authenticated PostgREST boundary as well as direct SQL.
// API sessions load safeupdate, which direct psql sessions do not: a bare UPDATE
// inside an RPC can otherwise pass SQL tests but fail every browser checkout.
const localEnv = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
const apiUrl = new URL(localEnv.NEXT_PUBLIC_SUPABASE_URL);
assert.ok(["127.0.0.1", "localhost"].includes(apiUrl.hostname), "Refusing a non-local Supabase API");
assert.equal(apiUrl.protocol, "http:");
const apiHeaders = { apikey: localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" };
const login = await fetch(new URL("/auth/v1/token?grant_type=password", apiUrl), {
  method: "POST", headers: apiHeaders, body: JSON.stringify({ email: "owner@demo.com", password: "123456" }),
});
assert.equal(login.status, 200, "Local fixture owner authentication failed");
const session = await login.json();
assert.equal(session.user.id, actor);
apiHeaders.Authorization = `Bearer ${session.access_token}`;
async function rpc(name, payload) {
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, apiUrl), {
    method: "POST", headers: apiHeaders, body: JSON.stringify(payload),
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${name}: ${data.code ?? ""} ${data.message ?? ""}`);
  return data;
}
const created = await rpc("create_talvo_supply_item", {
  p_business_id: business, p_name: "API concurrency beans", p_base_unit_id: "10000000-0000-4000-8000-000000000002",
  p_quantity_step: 0.001, p_is_lot_tracked: false, p_initial_expiry_mode: "NON_EXPIRING",
  p_idempotency_key: `api-create-${business}`,
});
assert.equal(created.ok, true);
const supplyId = created.data.supply_item_id;
const received = await rpc("receive_talvo_supply_item", {
  p_business_id: business, p_branch_id: branch, p_supply_item_id: supplyId, p_quantity_base: 1000,
  p_provenance_source_ref: "local-api-regression", p_external_batch_code: null, p_manufacturer_use_by_at: null,
  p_idempotency_key: `api-receive-${business}`,
});
assert.equal(received.ok, true);
sql(`insert into public.recipe_items(shop_id,branch_id,variant_id,supply_item_id,quantity)
values('${business}','${branch}','${variant}','${supplyId}',20);`);
const apiRequest = {
  p_shop_id: business, p_branch_id: branch, p_items: [{ variant_id: variant, qty: 2, sweetness: "100%" }],
  p_payment_method: "cash", p_paid_amount: 120, p_idempotency_key: `api-sale-${business}`,
};
const apiResults = await Promise.all(Array.from({ length: 3 }, () => rpc("process_pos_checkout_atomic", apiRequest)));
assert.equal(apiResults[0].success, true);
assert.deepEqual(apiResults[0], apiResults[1]);
assert.deepEqual(apiResults[0], apiResults[2]);
assert.equal(apiResults[0].order.inventory_snapshot.ingredients.length, 2);
assert.equal(sql(`select count(*) from public.orders where shop_id='${business}';`), "2");
assert.equal(Number(sql(`select stock from public.ingredients where id='${ingredient}';`)), 920);
const currentSupply = (await rpc("list_talvo_supply_items", { p_business_id: business, p_branch_id: branch }))
  .find((item) => item.id === supplyId);
assert.equal(currentSupply.available_stock, 960);
assert.equal(sql(`select count(*) from public.stock_logs where shop_id='${business}' and type='deduct';`), "2");
console.log("PASS authenticated Supabase API: three concurrent mixed-inventory checkouts deduct once");
console.log("All Sale → Recipe → Inventory integration checks passed against disposable local Supabase.");
