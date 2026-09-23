import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

// No remote target or connection-string option. This creates disposable fixtures only.
const project = "coffee-saas-v1-local-runtime";
const container = `supabase_db_${project}`;
const inspected = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}', container], { encoding: "utf8" });
assert.equal(inspected.status, 0); assert.equal(inspected.stdout.trim(), project);
function sql(input) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout.trim();
}
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).flatMap((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/); return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
}));
const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); assert.equal(url.protocol, "http:");
const headers = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" };
const login = await fetch(new URL("/auth/v1/token?grant_type=password", url), { method: "POST", headers, body: JSON.stringify({ email: "owner@demo.com", password: "123456" }) });
assert.equal(login.status, 200, "Seed local browser fixture first");
const session = await login.json(); headers.Authorization = `Bearer ${session.access_token}`;
async function rpc(name, payload, expected = name === "set_recipe_stock_minimum" ? 204 : 200) {
  if (name === "cancel_order") payload = { p_cancelled_by: session.user.id, p_note: null, ...payload };
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, url), { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await response.text();
  assert.equal(response.status, expected, `${name}: ${text}`); return text ? JSON.parse(text) : null;
}
const [business, branch, otherBranch, category, serve, menu, variant, legacy, staff] = Array.from({ length: 9 }, () => crypto.randomUUID());
sql(`begin;
insert into public.shops(id,name,slug) values('${business}','Usable Stock Test ${business.slice(0, 8)}','usable-${business}');
insert into public.shop_members(shop_id,user_id,role) values('${business}','${session.user.id}','owner');
insert into auth.users(id,email) values('${staff}','staff-${staff}@local.invalid');
insert into public.shop_members(shop_id,user_id,role) values('${business}','${staff}','staff');
insert into public.branch(id,shop_id,name,is_active) values('${branch}','${business}','Stock Test Branch',true),('${otherBranch}','${business}','Other Stock Branch',true);
insert into talvo.inventory_locations(business_id,branch_id,kind)
select '${business}',id,k.kind from public.branch cross join(values('BRANCH_AVAILABLE'),('BRANCH_QUARANTINE')) k(kind) where shop_id='${business}';
update public.branch set is_active=true where shop_id='${business}';
insert into public.menu_categories(id,shop_id,name) values('${category}','${business}','Coffee');
insert into public.menu_serve_types(id,shop_id,name) values('${serve}','${business}','Hot');
insert into public.menu(id,shop_id,category_id,name,price) values('${menu}','${business}','${category}','Stock Test Latte',60);
insert into public.menu_variants(id,shop_id,menu_id,serve_type_id,is_default) values('${variant}','${business}','${menu}','${serve}',true);
insert into public.ingredients(id,shop_id,branch_id,name,stock,unit,base_unit,is_active,track_lots,expiry_tracking_enabled,min_stock)
values('${legacy}','${business}','${branch}','Milk',10000,'g','g',true,false,false,500);
insert into public.recipe_items(shop_id,branch_id,variant_id,ingredient_id,quantity) values('${business}','${branch}','${variant}','${legacy}',20);
commit;`);
const context = { p_business_id: business, p_branch_id: branch };
const created = await rpc("create_talvo_supply_item", { p_business_id: business, p_name: "Milk", p_base_unit_id: "10000000-0000-4000-8000-000000000001", p_quantity_step: 1, p_is_lot_tracked: true, p_initial_expiry_mode: "REQUIRED_USE_BY", p_idempotency_key: `stock-create-${business}` });
assert.equal(created.ok, true); const supply = created.data.supply_item_id;
sql(`insert into public.recipe_items(shop_id,branch_id,variant_id,supply_item_id,quantity) values('${business}','${branch}','${variant}','${supply}',200),('${business}','${otherBranch}','${variant}','${supply}',200);`);
const read = () => rpc("get_recipe_usable_stock", context);
const milk = (stock) => stock.items.find((item) => item.id === supply);
assert.equal((await read()).items.length, 2, "same name across stores is not combined");
assert.equal(milk(await read()).usable_stock, 0);
assert.equal(milk(await read()).minimum_stock, null);
const minimum = { ...context, p_source_type: "supply_item", p_item_id: supply, p_minimum_stock: "3000" };
await rpc("set_recipe_stock_minimum", minimum);
assert.equal(milk(await read()).minimum_stock, 3000);
assert.equal(milk(await rpc("get_recipe_usable_stock", { ...context, p_branch_id: otherBranch })).minimum_stock, null);
await rpc("set_recipe_stock_minimum", { ...minimum, p_minimum_stock: -1 }, 400);
const receive = async (quantity, label, branchId = branch) => {
  const result = await rpc("receive_talvo_supply_item", { ...context, p_branch_id: branchId, p_supply_item_id: supply, p_quantity_base: quantity,
    p_provenance_source_ref: label, p_external_batch_code: label, p_manufacturer_use_by_at: new Date(Date.now() + 86400000 * 7).toISOString(), p_idempotency_key: `stock-${label}-${business}` });
  assert.equal(result.ok, true, JSON.stringify(result)); return result;
};
await receive(5000, "eligible");
await receive(9000, "other-branch", otherBranch);
assert.equal(milk(await read()).usable_stock, 5000);
const saleRequest = { p_shop_id: business, p_branch_id: branch, p_items: [{ variant_id: variant, qty: 10, sweetness: "100%" }], p_payment_method: "cash", p_paid_amount: 600, p_idempotency_key: `stock-sale-${business}` };
const sale = await rpc("process_pos_checkout_atomic", saleRequest); assert.equal(sale.success, true);
assert.equal(milk(await read()).usable_stock, 3000);
await rpc("process_pos_checkout_atomic", saleRequest); assert.equal(milk(await read()).usable_stock, 3000, "replayed sale must not deduct twice");
await rpc("cancel_order", { p_order_id: sale.order.id, p_reason: "ลูกค้ายกเลิก", p_restock: true, p_note: "local stock integration" });
assert.equal(milk(await read()).usable_stock, 5000);
await rpc("cancel_order", { p_order_id: sale.order.id, p_reason: "ลูกค้ายกเลิก", p_restock: true, p_note: "local stock integration" });
assert.equal(milk(await read()).usable_stock, 5000, "repeated cancellation must restore once");
const noRestock = await rpc("process_pos_checkout_atomic", { ...saleRequest, p_idempotency_key: `stock-no-restock-${business}` });
await rpc("cancel_order", { p_order_id: noRestock.order.id, p_reason: "กดผิด / ชงผิด", p_restock: false });
assert.equal(milk(await read()).usable_stock, 3000);
console.log("PASS receive 5000 → ten sales use 2000 → restock 5000; retries, no-restock cancellation, and other branch isolation");

// Seed ineligible historical fixtures directly; never disable or bypass history guards.
for (const label of ["expired", "recalled", "unverified", "quarantine"]) {
  const lot = crypto.randomUUID();
  sql(`begin;
insert into talvo.ingredient_lots(id,business_id,supply_item_id,expiry_policy_version_id,root_lot_id,provenance_source_ref,external_batch_code,provenance_status,manufacturer_use_by_at,effective_use_by_at,status,created_by)
select '${lot}','${business}','${supply}',expiry_policy_version_id,'${lot}','local historical fixture','${label}',
'${label === "unverified" ? "UNVERIFIED" : "VERIFIED"}',now()+interval '${label === "expired" ? "-1 second" : "7 days"}',now()+interval '${label === "expired" ? "-1 second" : "7 days"}',
'${label === "recalled" ? "RECALLED" : "ACTIVE"}','${session.user.id}' from talvo.ingredient_lots where business_id='${business}' and supply_item_id='${supply}' limit 1;
insert into talvo.inventory_balances(business_id,location_id,ingredient_lot_id,quantity_base)
select '${business}',id,'${lot}',1000 from talvo.inventory_locations where business_id='${business}' and branch_id='${branch}' and kind='${label === "quarantine" ? "BRANCH_QUARANTINE" : "BRANCH_AVAILABLE"}'; commit;`);
}
assert.equal(milk(await read()).usable_stock, 3000, "ineligible quantities excluded");
sql(`update public.ingredients set expiry_tracking_enabled=true where id='${legacy}';`);
assert.equal((await read()).items.find((item) => item.id === legacy).usable_stock, null);
assert.equal((await read()).items.find((item) => item.id === legacy).unavailable_reason, "LEGACY_LOT_BALANCE_UNAVAILABLE");
sql(`update public.ingredients set expiry_tracking_enabled=false where id='${legacy}';`);
sql(`begin; select set_config('request.jwt.claim.sub','${staff}',true); set local role authenticated;
do $$ begin
if (public.get_recipe_usable_stock('${business}','${branch}')->>'can_edit_minimum')::boolean then raise exception 'Staff edit exposed'; end if;
begin perform public.set_recipe_stock_minimum('${business}','${branch}','supply_item','${supply}',0); raise exception 'Staff write allowed'; exception when insufficient_privilege then null; end;
begin perform public.get_recipe_usable_stock('00000000-0000-4000-8000-000000000001','${branch}'); raise exception 'Other tenant visible'; exception when insufficient_privilege then null; end;
end $$; rollback;`);
await rpc("get_recipe_usable_stock", { ...context, p_branch_id: crypto.randomUUID() }, 400);
sql(`begin;
insert into public.daily_closes(shop_id,branch_id,business_date,status,counted_cash,cash_difference,closed_by,closed_at)
values('${business}','${branch}',(now() at time zone 'Asia/Bangkok')::date,'closed',0,0,'${session.user.id}',now());
select set_config('request.jwt.claim.sub','${session.user.id}',true); set local role authenticated;
do $$ begin
begin perform public.set_recipe_stock_minimum('${business}','${branch}','supply_item','${supply}',0); raise exception 'Post-close write allowed';
exception when sqlstate 'P0001' then if sqlerrm<>'BUSINESS_DAY_CLOSED' then raise; end if; end;
end $$; rollback;`);
console.log("PASS expired/recalled/unverified/quarantined exclusion, legacy unknown state, staff read-only, tenant access, and post-close guard");
// Persist only fixture IDs (no credentials) for the matching local browser flow.
fs.writeFileSync(".talvo-local-stock-fixture.log", JSON.stringify({ business, branch, otherBranch, menu, variant, supply, legacy }, null, 2));
console.log(`Browser fixture: Usable Stock Test ${business.slice(0, 8)} / Stock Test Branch / Stock Test Latte; usable milk 3000 ml, minimum 3000 ml.`);
