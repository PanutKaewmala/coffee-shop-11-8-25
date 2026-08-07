import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/pos/route.ts", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260807090000_atomic_pos_checkout.sql",
  "utf8",
);

// Normal checkout has one write boundary; the API does not directly mutate any
// order, item, ingredient, log, or idempotency table.
assert.match(route, /supabase\.rpc\("process_pos_checkout"/);
for (const table of ["orders", "order_items", "ingredients", "stock_logs", "pos_idempotency"]) {
  const post = route.slice(route.indexOf("export async function POST"));
  assert.doesNotMatch(post, new RegExp(`\\.from\\(\\"${table}\\"\\).*\\.(insert|update|delete)`, "s"));
}
assert.match(migration, /insert into public\.orders/);
assert.match(migration, /insert into public\.order_items/);
assert.match(migration, /update public\.ingredients/);
assert.match(migration, /insert into public\.stock_logs/);

// Insufficient stock and injected failures use exceptions, so PostgreSQL rolls
// back the order, items, stock, logs, and idempotency result together.
assert.match(migration, /raise exception 'Not enough stock:/);
assert.match(migration, /v_failpoint = 'after_order'.*raise exception/s);
assert.match(migration, /v_failpoint = 'during_stock_log'.*raise exception/s);

// Sequential and concurrent retries are claimed before side effects. The
// advisory xact lock blocks the concurrent retry; the stored response handles
// both it and a later sequential retry.
assert.match(migration, /pg_advisory_xact_lock/);
assert.ok(migration.indexOf("pg_advisory_xact_lock") < migration.indexOf("insert into public.orders"));
assert.match(migration, /if found then[\s\S]*return v_existing\.response/);
assert.match(migration, /request_hash <> v_request_hash/);

// Competing orders serialize on ingredient rows and recheck stock while locked.
assert.match(migration, /order by i\.id[\s\S]*for update of i/);
assert.ok(migration.indexOf("for update of i") < migration.indexOf("if v_row.stock < v_row.deduct"));

// Closed-day and tenant checks live inside the transaction, not only in the API.
assert.match(migration, /dc\.status in \('closed', 'approved'\)/);
assert.match(migration, /raise exception 'BUSINESS_DAY_CLOSED'/);
assert.match(migration, /sm\.user_id = v_user_id and sm\.shop_id = p_shop_id/);
assert.match(migration, /b\.id = p_branch_id and b\.shop_id = p_shop_id/);
assert.match(migration, /i\.shop_id = p_shop_id and i\.branch_id = p_branch_id/);

console.log("Atomic POS checkout contract checks passed");
