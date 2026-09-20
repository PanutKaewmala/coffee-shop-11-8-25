import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the real route and parsing functions with deterministic database boundaries.
// Database constraints/RLS/checkout deduction are covered by the SQL integration suite.
function loadTypeScript(path, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  const require = (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  new Function("require", "module", "exports", compiled)(require, loaded, loaded.exports);
  return loaded.exports;
}

const recipeTypes = loadTypeScript("src/lib/recipeTypes.ts");
const supply = {
  id: "supply", name: "Coffee beans", base_unit: "g", quantity_step: "0.1",
  available_stock: "500.2", is_lot_tracked: true,
};
assert.equal(recipeTypes.isRecipeQuantityStepValid(0.3, 0.1), true, "ordinary decimal quantities are accepted");
for (const [quantity, step] of [[0.31, 0.1], [0, 1], [-1, 1], [Infinity, 1], [1, 0]]) {
  assert.equal(recipeTypes.isRecipeQuantityStepValid(quantity, step), false);
}
assert.deepEqual(recipeTypes.parseRecipeSupplies([supply]), [{ ...supply, quantity_step: 0.1, available_stock: 500.2 }]);
for (const invalid of [null, {}, [{ ...supply, available_stock: null }], [{ ...supply, quantity_step: true }], [{ ...supply, available_stock: "" }]]) {
  assert.throws(() => recipeTypes.parseRecipeSupplies(invalid), /Invalid supply inventory/);
}

function harness(options = {}) {
  const state = {
    user: options.user === null ? null : { id: "owner" },
    role: options.role ?? "owner",
    shopId: "shop", branchId: options.branchId ?? "branch-a",
    recipes: (options.recipes ?? []).map((row) => ({ ...row })),
    supplies: options.supplies ?? [supply],
    calls: [],
  };
  function client(kind) {
    return {
      auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
      rpc: async (name, args) => {
        state.calls.push({ kind, rpc: name, args });
        assert.equal(name, "list_talvo_supply_items");
        return { data: state.supplies, error: options.rpcError ?? null };
      },
      from(table) {
        const query = { kind, table, operation: "select", filters: [], alternatives: [], body: null, single: false };
        const builder = {
          select() { return this; },
          order() { return this; },
          eq(column, value) { query.filters.push([column, value]); return this; },
          or(expression) {
            query.alternatives = expression.split(",").map((clause) => {
              const [column, operator, value] = clause.split(".");
              assert.ok(operator === "eq" || operator === "is");
              return [column, operator === "is" && value === "null" ? null : value];
            });
            return this;
          },
          in(column, values) { query.filters.push([column, values]); return this; },
          insert(body) { query.operation = "insert"; query.body = body; return this; },
          update(body) { query.operation = "update"; query.body = body; return this; },
          delete() { query.operation = "delete"; return this; },
          single() { query.single = true; return this; },
          maybeSingle() { query.single = true; return this; },
          overrideTypes() { return this; },
          then(resolve, reject) {
            try { return Promise.resolve(execute()).then(resolve, reject); }
            catch (error) { return Promise.reject(error).then(resolve, reject); }
          },
        };
        function execute() {
          state.calls.push(query);
          const matches = (row) => query.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value)
            && (query.alternatives.length === 0 || query.alternatives.some(([key, value]) => row[key] === value));
          let rows;
          if (table === "shop_members") rows = [{ user_id: "owner", shop_id: "shop", role: state.role }];
          else if (table === "branch") rows = [{ id: "branch-a", shop_id: "shop" }, { id: "branch-b", shop_id: "shop" }];
          else if (table === "menu_variants") rows = [{ id: "variant", menu_id: "menu", shop_id: "shop" }];
          else if (table === "ingredients") rows = [
            { id: "legacy", shop_id: "shop", branch_id: "branch-a", is_active: true, archived_at: null },
            { id: "foreign", shop_id: "shop", branch_id: "branch-b", is_active: true, archived_at: null },
            { id: "archived", shop_id: "shop", branch_id: "branch-a", is_active: true, archived_at: "2026-01-01" },
          ];
          else if (table === "recipe_items") rows = state.recipes;
          else throw new Error(`Unexpected table ${table}`);
          if (query.operation === "insert") {
            assert.equal(kind, "authenticated", "recipe writes must retain RLS");
            const next = { id: `recipe-${rows.length}`, created_at: "2026-09-10", ...query.body };
            if (rows.some((row) => row.shop_id === next.shop_id && row.branch_id === next.branch_id && row.variant_id === next.variant_id && row.ingredient_id === next.ingredient_id && row.supply_item_id === next.supply_item_id)) {
              return { data: null, error: { code: "23505", message: "duplicate source" } };
            }
            rows.push(next);
            return { data: next, error: null };
          }
          const found = rows.filter(matches);
          if (query.operation === "update") {
            assert.equal(kind, "authenticated");
            for (const row of found) Object.assign(row, query.body);
          }
          if (query.operation === "delete") {
            assert.equal(kind, "authenticated");
            state.recipes = rows.filter((row) => !matches(row));
          }
          return { data: query.single ? found[0] ?? null : found, error: null };
        }
        return builder;
      },
    };
  }
  const api = loadTypeScript("src/app/api/recipes/items/route.ts", {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/lib/supabaseServer": {
      getSupabaseServer: async () => client("authenticated"),
      getCurrentContextFromCookies: async () => ({ currentShopId: state.shopId, currentBranchId: state.branchId }),
    },
    "@/lib/supabaseAdmin": { getSupabaseAdmin: () => client("admin") },
    "@/lib/recipeTypes": recipeTypes,
  });
  const request = (body, search = "") => ({ nextUrl: new URL(`http://local/api/recipes/items${search}`), json: async () => body });
  return { state, api, request };
}

const body = { variant_id: "variant", supply_item_id: "supply", quantity: 18.2 };
for (const invalidBody of ["quantity=2", 1, true, [], null]) {
  const { api, request } = harness();
  assert.equal((await api.POST(request(invalidBody))).status, 400);
  assert.equal((await api.PUT(request(invalidBody, "?id=recipe"))).status, 400);
}
for (const options of [{ user: null }, { role: "staff" }, { role: "viewer" }, { branchId: "other-shop-branch" }]) {
  const { state, api, request } = harness(options);
  for (const method of ["POST", "PUT", "DELETE"]) {
    const response = await api[method](request({ ...body, id: "recipe" }, "?id=recipe"));
    assert.equal(response.status, options.user === null ? 401 : 403, `${method} rejects unauthorized context`);
  }
  assert.equal(state.calls.some((call) => call.operation && call.operation !== "select"), false);
}
for (const invalid of [
  { ...body, ingredient_id: "legacy" }, { ...body, supply_item_id: null },
  { ...body, quantity: 18.21 }, { ...body, quantity: true }, { ...body, quantity: 0 },
]) {
  const { state, api, request } = harness();
  assert.equal((await api.POST(request(invalid))).status, 400);
  assert.equal(state.recipes.length, 0, "invalid recipes must not be saved");
}

const flow = harness();
const created = await flow.api.POST(flow.request({ ...body, branch_id: "branch-b", shop_id: "other-shop" }));
assert.equal(created.status, 201);
const createdBody = await created.json();
assert.equal(createdBody.item.branch_id, "branch-a", "client branch cannot redirect mutation");
assert.equal(createdBody.item.source_type, "supply_item");
assert.equal(createdBody.item.ingredient_name, "Coffee beans");
assert.equal(createdBody.item.unit, "g");
assert.equal(flow.state.recipes[0].ingredient_id, null, "supply source cannot retain legacy ingredient ID");
const replacement = await flow.api.POST(flow.request({ ...body, quantity: 20 }));
assert.equal(replacement.status, 200);
assert.equal(flow.state.recipes.length, 1, "repeated source replaces quantity without a second recipe row");
assert.equal(flow.state.recipes[0].quantity, 20);
for (const call of flow.state.calls.filter((call) => call.rpc)) {
  assert.deepEqual(call.args, { p_business_id: "shop", p_branch_id: "branch-a" });
}

const otherBranch = { ...flow.state.recipes[0], id: "other-recipe", branch_id: "branch-b", quantity: 30 };
flow.state.recipes.push(otherBranch);
const listed = await flow.api.GET(flow.request(null, "?variant_id=variant&branch_id=branch-b"));
assert.equal((await listed.json()).items.length, 1, "listing only returns current branch recipes");
assert.equal((await flow.api.PUT(flow.request({ id: "other-recipe", quantity: 40 }))).status, 404);
assert.equal((await flow.api.DELETE(flow.request(null, "?id=other-recipe"))).status, 404);
assert.equal(otherBranch.quantity, 30);
assert.equal((await flow.api.PUT(flow.request({ id: createdBody.item.id, quantity: 21.1 }))).status, 200);
assert.equal(flow.state.recipes[0].quantity, 21.1);
assert.equal((await flow.api.PUT(flow.request({ id: createdBody.item.id, quantity: 21.11 }))).status, 400);
assert.equal((await flow.api.DELETE(flow.request(null, `?id=${createdBody.item.id}`))).status, 200);
assert.deepEqual(flow.state.recipes, [otherBranch]);

for (const [ingredientId, expectedStatus] of [["legacy", 201], ["foreign", 404], ["archived", 400]]) {
  const { state, api, request } = harness();
  const response = await api.POST(request({ variant_id: "variant", ingredient_id: ingredientId, quantity: 10 }));
  assert.equal(response.status, expectedStatus);
  assert.equal(state.recipes.length, expectedStatus === 201 ? 1 : 0);
}
const unavailable = harness({ rpcError: { code: "42501", message: "Access denied" } });
assert.equal((await unavailable.api.POST(unavailable.request(body))).status, 403);
assert.equal(unavailable.state.recipes.length, 0, "failed stock-source lookup must not fall back to a silent empty recipe");

const brokenRecipe = {
  id: "unassigned", shop_id: "shop", branch_id: null, variant_id: "variant", ingredient_id: "foreign",
  supply_item_id: null, quantity: 10, created_at: "2026-01-01",
};
const repair = harness({ recipes: [brokenRecipe, otherBranch] });
const repairList = await (await repair.api.GET(repair.request(null, "?variant_id=variant"))).json();
assert.deepEqual(repairList.items.map((item) => item.id), ["unassigned"], "unassigned recipes are visible without leaking explicit other-branch rows");
assert.equal(repairList.items[0].branch_id, null);
assert.equal((await repair.api.PUT(repair.request({ id: "unassigned", quantity: 5 }))).status, 404, "repair must validate the existing source against the selected branch");
assert.equal(repair.state.recipes[0].branch_id, null);
assert.equal((await repair.api.PUT(repair.request({ id: "unassigned", ingredient_id: "legacy", quantity: 5, branch_id: "branch-b" }))).status, 200);
assert.equal(repair.state.recipes[0].branch_id, "branch-a", "repair assigns only the validated current branch");
assert.equal(repair.state.recipes[0].ingredient_id, "legacy");
assert.equal(repair.state.recipes[1].branch_id, "branch-b");
repair.state.recipes.push({ ...brokenRecipe, id: "remove-unassigned" });
assert.equal((await repair.api.DELETE(repair.request(null, "?id=remove-unassigned"))).status, 200, "owner can remove a broken unassigned recipe");
assert.equal((await repair.api.DELETE(repair.request(null, "?id=other-recipe"))).status, 404);

console.log("Recipe inventory behavioral tests passed (authorization, branch scope, source validation, quantity steps, duplicate replacement, and editing)");
