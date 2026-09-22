import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const stockLib = load("src/lib/usableStock.ts");
const item = { source_type: "supply_item", id: "10000000-0000-4000-8000-000000000001", name: "Milk", unit: "ml", usable_stock: 1000, minimum_stock: 500, unavailable_reason: null };
const stock = { shop_id: "shop", branch_id: "branch", branch_name: "Branch", as_of: new Date().toISOString(), can_edit_minimum: true, items: [item] };
assert.equal(stockLib.stockStatus(item), "normal");
assert.equal(stockLib.stockStatus({ ...item, usable_stock: 500 }), "low");
assert.equal(stockLib.stockStatus({ ...item, usable_stock: 0 }), "out");
assert.equal(stockLib.stockStatus({ ...item, usable_stock: 0, minimum_stock: null }), "out");
assert.equal(stockLib.stockStatus({ ...item, minimum_stock: null }), "normal");
assert.equal(stockLib.stockStatus({ ...item, usable_stock: null, unavailable_reason: "LEGACY_LOT_BALANCE_UNAVAILABLE" }), "unavailable");
assert.deepEqual(stockLib.parseUsableStock(stock), stock);
for (const bad of [null, {}, { ...stock, items: [item, item] }, { ...stock, as_of: "yesterday" },
  ...[null, undefined, "1000", NaN, Infinity, -1, false].map((quantity) => ({ ...stock, items: [{ ...item, usable_stock: quantity }] }))]) {
  assert.throws(() => stockLib.parseUsableStock(bad));
}
for (const value of ["0", "500", "0.000001", "999999999999.999999"]) assert.equal(stockLib.validMinimum(value), true);
for (const value of [null, false, 500, "", " ", "-1", "1e3", "0.0000001", "1000000000000", "NaN"]) assert.equal(stockLib.validMinimum(value), false);

let identity = { user: { id: "owner" }, currentShopId: "shop", currentBranchId: "branch", currentShopRole: "owner" };
let rpcError = null; let loadError = false; const calls = [];
const server = {
  getServerIdentity: async () => identity,
  getSupabaseServer: async () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { error: rpcError }; } }),
};
const route = load("src/app/api/stock/usable/route.ts", {
  "next/server": { NextResponse: { json: (body, options = {}) => new Response(JSON.stringify(body), { ...options, headers: { "Content-Type": "application/json" } }) } },
  "@/lib/supabaseServer": server, "@/lib/usableStock": stockLib,
  "@/lib/usableStockServer": { loadUsableStock: async () => { if (loadError) throw new Error("database offline"); return stock; } },
});
const payload = { shop_id: "shop", branch_id: "branch", source_type: item.source_type, item_id: item.id, minimum_stock: "500.5" };
const patch = (body = payload) => route.PATCH(new Request("http://localhost/api/stock/usable", { method: "PATCH", body: JSON.stringify(body) }));
assert.equal((await route.GET()).status, 200);
assert.equal((await patch()).status, 200);
assert.equal(calls.at(-1).args.p_minimum_stock, "500.5", "decimal string reaches SQL without binary rounding");
for (const minimum_stock of [null, false, "", "-1", "1e3"]) assert.equal((await patch({ ...payload, minimum_stock })).status, 400);
assert.equal((await patch({ ...payload, branch_id: "other" })).status, 409);
identity.currentShopRole = "staff";
assert.equal((await route.GET()).status, 200);
assert.equal((await patch()).status, 403);
identity.currentShopRole = "owner";
identity.user = null;
assert.equal((await route.GET()).status, 401);
assert.equal((await patch()).status, 401);
identity.user = { id: "owner" };
identity.currentBranchId = null;
assert.equal((await route.GET()).status, 409);
identity.currentBranchId = "branch";
loadError = true;
assert.equal((await route.GET()).status, 503);
rpcError = { code: "P0001", message: "BUSINESS_DAY_CLOSED" };
assert.equal((await patch()).status, 409);
rpcError = { code: "XX000", message: "unavailable" };
assert.equal((await patch()).status, 503);

const presentation = load("src/lib/dashboardTodayPresentation.ts");
const today = { tasks: { outOfStock: [], lowStock: [], expiringLots: [], unavailableStock: [{ id: item.id, name: item.name }] },
  yesterdayClose: null, sales: { paidOrderCount: 0 }, reviewEvents: { orders: [], stock: [] }, dates: { yesterday: { date: "2026-09-20" } } };
let view = presentation.buildDashboardTodayPresentation(today);
assert.equal(view.overview.actionCount, 1, "unknown balances must prevent an all-clear overview");
assert.equal(view.actions[0].id, "stock-unavailable");
assert.equal(view.actions[0].href, "/admin/stock/usable");
view = presentation.buildDashboardTodayPresentation({ ...today, tasks: { ...today.tasks, unavailableStock: [], lowStock: [{ id: item.id, name: item.name, stock: 200, minStock: 500, unit: "ml" }] } });
assert.equal(view.actions[0].id, "low-stock");
assert.equal(view.actions[0].href, "/admin/stock/usable");
const mixedAlerts = { ...today,
  yesterdayClose: { status: "closed", cashDifference: -100 },
  tasks: { ...today.tasks,
    outOfStock: [{ id: "empty", name: "Milk", stock: 0, unit: "ml" }],
    lowStock: [{ id: "low", name: "Coffee", stock: 200, minStock: 500, unit: "g" }],
    expiringLots: [{ daysToExpiry: -1, ingredientName: "Cream" }, { daysToExpiry: 1, ingredientName: "Syrup" }],
  },
};
view = presentation.buildDashboardTodayPresentation(mixedAlerts);
assert.deepEqual(view.visibleActions.map((action) => action.id),
  ["out-of-stock", "expired-lots", "cash-variance", "low-stock", "stock-unavailable"],
  "mixed alerts must retain the top three and explicitly show every shortage/unavailable group in priority order");
assert.equal(view.hiddenActionCount, 1, "only the unshown near-expiry group is counted as hidden");
assert.equal(view.overview.actionCount, 6);
view = presentation.buildDashboardTodayPresentation({ ...mixedAlerts,
  tasks: { ...mixedAlerts.tasks, lowStock: [], unavailableStock: [] },
});
assert.deepEqual(view.visibleActions.map((action) => action.id), ["out-of-stock", "expired-lots", "cash-variance"]);
assert.equal(view.hiddenActionCount, 1, "unrelated alert truncation remains unchanged");
console.log("PASS usable stock: classification, malformed data, minimum validation, API authorization, branch context, failures, and Daily Overview shortages including mixed alerts");
