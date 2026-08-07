import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/pos/route.ts", "utf8");
const closeRoute = fs.readFileSync("src/app/api/daily-close/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260807090000_atomic_pos_checkout.sql", "utf8");

// The API has one checkout write boundary.
assert.match(route, /supabase\.rpc\("process_pos_checkout"/);
for (const table of ["orders", "order_items", "ingredients", "stock_logs", "pos_idempotency"]) {
  const post = route.slice(route.indexOf("export async function POST"));
  assert.doesNotMatch(post, new RegExp(`\\.from\\(\\"${table}\\"\\).*\\.(insert|update|delete)`, "s"));
}

// Same variant/same sweetness aggregates; different sweetness remains separate,
// deterministic order-item lines. Recipe deduction still sums every staged line.
assert.match(migration, /primary key \(variant_id, sweetness\)/);
assert.match(migration, /group by \(item->>'variant_id'\)::uuid, item->>'sweetness'/);
assert.match(migration, /sum\(ri\.quantity \* l\.qty\)/);
assert.match(migration, /order by variant_id, sweetness/);
for (const sweetness of ["0%", "25%", "50%", "75%", "100%", "125%"]) {
  assert.ok(migration.includes(`'${sweetness}'`));
}
assert.doesNotMatch(migration, /min\(x\.sweetness\)/);

// Idempotency claim precedes every side effect and distinguishes payloads.
assert.match(migration, /pg_advisory_xact_lock/);
assert.ok(migration.indexOf("pg_advisory_xact_lock") < migration.indexOf("insert into public.orders"));
assert.match(migration, /if found then[\s\S]*return v_existing\.response/);
assert.match(migration, /request_hash <> v_request_hash/);

// Competing checkouts serialize stock validation in a stable order.
assert.match(migration, /order by i\.id[\s\S]*for update of i/);
assert.ok(migration.indexOf("for update of i") < migration.indexOf("if v_row.stock < v_row.deduct"));

// Checkout and close use the same canonical business-day lock expression, and
// close computes its snapshot and status in its RPC transaction.
const lockExpression = "p_shop_id::text || ':' || p_branch_id::text || ':' ||";
assert.equal(migration.split(lockExpression).length - 1, 2);
assert.match(closeRoute, /supabase\.rpc\("finalize_daily_close"/);
assert.match(migration, /create or replace function public\.finalize_daily_close/);
assert.match(migration, /dc\.status in \('closed', 'approved'\)/);

// SECURITY DEFINER functions fail closed and do not expose test failpoints.
assert.match(migration, /sm\.role in \('owner', 'staff'\)/);
assert.match(migration, /sm\.role = 'owner'/);
assert.equal(migration.split("set search_path = pg_catalog, pg_temp").length - 1, 2);
assert.match(migration, /extensions\.digest/);
assert.doesNotMatch(migration, /test_failpoint|POS_TEST_FAILURE|current_setting/);
assert.match(migration, /b\.id = p_branch_id and b\.shop_id = p_shop_id/);
assert.match(migration, /i\.shop_id = p_shop_id and i\.branch_id = p_branch_id/);

console.log("Atomic POS checkout contract checks passed");
