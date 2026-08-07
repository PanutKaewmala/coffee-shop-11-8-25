import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260807090000_atomic_pos_checkout.sql", "utf8");
assert.match(migration, /process_pos_checkout_atomic/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /line_identity/);
assert.match(migration, /cancel_order_without_business_day_guard/);
assert.match(migration, /revoke all on function public\.cancel_order_without_business_day_guard[^;]+authenticated/i);
assert.match(migration, /finalize_daily_close_atomic/);
assert.match(migration, /create_cash_movement_atomic/);
console.log("POS atomic checkout static contract passed");
