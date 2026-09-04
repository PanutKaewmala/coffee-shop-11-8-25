import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");

function fail(message) {
  console.error(`\nTALVO local browser fixture failed: ${message}`);
  process.exit(1);
}

function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

if (!fs.existsSync(envPath)) fail(".env.local is missing");
const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) fail("Local Supabase URL/service-role key are missing from .env.local");

let parsedUrl;
try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  fail("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
}

if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
  fail(`Refusing to seed a non-local Supabase URL: ${parsedUrl.hostname}`);
}

const commonHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function readBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(url, init = {}, label = "request") {
  const res = await fetch(url, init);
  const body = await readBody(res);
  if (!res.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    fail(`${label} returned ${res.status}: ${detail}`);
  }
  return body;
}

async function restGet(table, query) {
  return request(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: commonHeaders,
  }, `GET ${table}`);
}

async function upsert(table, row, onConflict = "id") {
  const conflict = encodeURIComponent(onConflict);
  return request(`${supabaseUrl}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: {
      ...commonHeaders,
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(row),
  }, `UPSERT ${table}`);
}

const EMAIL = "owner@demo.com";
const PASSWORD = "123456";
const SHOP_ID = "10000000-0000-4000-8000-000000000001";
const FALLBACK_BRANCH_ID = "10000000-0000-4000-8000-000000000002";
const CATEGORY_ID = "10000000-0000-4000-8000-000000000003";
const FALLBACK_SERVE_ID = "10000000-0000-4000-8000-000000000004";
const MENU_ID = "10000000-0000-4000-8000-000000000005";
const VARIANT_ID = "10000000-0000-4000-8000-000000000006";
const INGREDIENT_ID = "10000000-0000-4000-8000-000000000007";
const RECIPE_ITEM_ID = "10000000-0000-4000-8000-000000000008";
const MENU_SERVE_ID = "10000000-0000-4000-8000-000000000009";
const AVAILABILITY_ID = "10000000-0000-4000-8000-000000000010";

async function getOrCreateUser() {
  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { purpose: "talvo-local-browser-fixture" },
    }),
  });

  if (createRes.ok) {
    const created = await readBody(createRes);
    return created?.id ?? created?.user?.id;
  }

  const createBody = await readBody(createRes);
  const createText = typeof createBody === "string" ? createBody : JSON.stringify(createBody);
  const duplicate = createRes.status === 422 || /already|registered|exists/i.test(createText);
  if (!duplicate) fail(`Create local auth user returned ${createRes.status}: ${createText}`);

  const listed = await request(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: commonHeaders,
  }, "List local auth users");
  const users = Array.isArray(listed) ? listed : (listed?.users ?? []);
  const existing = users.find((user) => String(user?.email ?? "").toLowerCase() === EMAIL);
  if (!existing?.id) fail("Local auth user already exists but could not be resolved by email");

  await request(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
    method: "PUT",
    headers: commonHeaders,
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  }, "Reset local fixture password");

  return existing.id;
}

console.log("Seeding disposable browser fixture into local Supabase only...");

const userId = await getOrCreateUser();
if (!userId) fail("Could not resolve local fixture user id");

await upsert("shops", {
  id: SHOP_ID,
  name: "TALVO Local Demo",
  slug: "talvo-local-demo",
  receipt_footer: "Local browser-test fixture only",
});

let branches = await restGet("branch", `shop_id=eq.${SHOP_ID}&select=id,name,is_primary,is_active&order=created_at.asc&limit=1`);
let branchId = Array.isArray(branches) && branches[0]?.id ? branches[0].id : null;
if (!branchId) {
  await upsert("branch", {
    id: FALLBACK_BRANCH_ID,
    shop_id: SHOP_ID,
    name: "Local Branch",
    is_primary: true,
    is_active: true,
  });
  branchId = FALLBACK_BRANCH_ID;
}

await upsert("profiles", {
  id: userId,
  email: EMAIL,
  role: "owner",
  current_shop_id: SHOP_ID,
  current_branch_id: branchId,
});

await upsert("shop_members", {
  shop_id: SHOP_ID,
  user_id: userId,
  role: "owner",
}, "shop_id,user_id");

await upsert("menu_categories", {
  id: CATEGORY_ID,
  shop_id: SHOP_ID,
  name: "Coffee",
});

let serveTypes = await restGet("menu_serve_types", `shop_id=eq.${SHOP_ID}&system_key=eq.default&select=id&limit=1`);
let serveTypeId = Array.isArray(serveTypes) && serveTypes[0]?.id ? serveTypes[0].id : null;
if (!serveTypeId) {
  await upsert("menu_serve_types", {
    id: FALLBACK_SERVE_ID,
    shop_id: SHOP_ID,
    name: "Default",
    is_system: true,
    system_key: "default",
  });
  serveTypeId = FALLBACK_SERVE_ID;
}

await upsert("ingredients", {
  id: INGREDIENT_ID,
  shop_id: SHOP_ID,
  branch_id: branchId,
  name: "Local Test Coffee",
  stock: 1000,
  unit: "ml",
  base_unit: "ml",
  category: "coffee",
  cost_per_unit: 0.5,
  is_active: true,
  min_stock: 0,
});

await upsert("menu", {
  id: MENU_ID,
  shop_id: SHOP_ID,
  category_id: CATEGORY_ID,
  name: "Local Test Americano",
  description: "Disposable local browser-test menu",
  price: 60,
});

await upsert("menu_serves", {
  id: MENU_SERVE_ID,
  shop_id: SHOP_ID,
  menu_id: MENU_ID,
  serve_type_id: serveTypeId,
});

await upsert("menu_variants", {
  id: VARIANT_ID,
  shop_id: SHOP_ID,
  menu_id: MENU_ID,
  serve_type_id: serveTypeId,
  size: "default",
  price_override: null,
  is_default: true,
});

await upsert("recipe_items", {
  id: RECIPE_ITEM_ID,
  shop_id: SHOP_ID,
  variant_id: VARIANT_ID,
  ingredient_id: INGREDIENT_ID,
  quantity: 20,
});

await upsert("branch_menu_availability", {
  id: AVAILABILITY_ID,
  shop_id: SHOP_ID,
  branch_id: branchId,
  menu_id: MENU_ID,
  is_enabled: true,
});

const verification = await Promise.all([
  restGet("shops", `id=eq.${SHOP_ID}&select=id,name`),
  restGet("branch", `id=eq.${branchId}&select=id,name,is_active`),
  restGet("shop_members", `shop_id=eq.${SHOP_ID}&user_id=eq.${userId}&select=shop_id,user_id,role`),
  restGet("menu", `id=eq.${MENU_ID}&select=id,name,price`),
  restGet("menu_variants", `id=eq.${VARIANT_ID}&select=id,menu_id,is_default`),
  restGet("recipe_items", `id=eq.${RECIPE_ITEM_ID}&select=id,ingredient_id,quantity`),
]);

if (verification.some((rows) => !Array.isArray(rows) || rows.length !== 1)) {
  fail("Fixture verification did not find every expected row exactly once");
}

console.log("TALVO_LOCAL_BROWSER_FIXTURE_READY");
console.log(`Login: ${EMAIL} / ${PASSWORD}`);
console.log("Shop: TALVO Local Demo");
console.log("Branch: one local branch");
console.log("POS menu: Local Test Americano (60 THB)");
console.log("All fixture data exists only in the disposable local Supabase instance.");
