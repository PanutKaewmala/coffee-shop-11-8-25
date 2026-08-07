import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260807090000_atomic_pos_checkout.sql", "utf8");
const checkout = migration.slice(migration.indexOf("create or replace function public.process_pos_checkout_atomic"), migration.indexOf("create or replace function public.create_cash_movement_atomic"));
const cash = migration.slice(migration.indexOf("create or replace function public.create_cash_movement_atomic"), migration.indexOf("alter function public.cancel_order"));
const cancellation = migration.slice(migration.indexOf("alter function public.cancel_order"), migration.indexOf("create or replace function public.finalize_daily_close_atomic"));
const close = migration.slice(migration.indexOf("create or replace function public.finalize_daily_close_atomic"));

assert.ok(checkout.indexOf("pos-idempotency:") < checkout.indexOf("create temporary table"), "idempotency advisory lock precedes checkout side effects");
assert.ok(checkout.indexOf("pos-idempotency:") < checkout.indexOf("insert into public.orders"), "idempotency lock precedes order insert");
assert.match(checkout, /request_hash, response/);
assert.match(checkout, /IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST/);
assert.match(checkout, /primary key \(variant_id, sweetness\)/, "sweetness participates in line identity");
for (const sweetness of ["0%", "25%", "50%", "75%", "100%", "125%"])
  assert.match(checkout, new RegExp(`'${sweetness.replace("%", "\\%")}'`));
assert.match(checkout, /sum\(r\.quantity \* l\.qty\)/, "recipe use aggregates across sweetness lines");
assert.match(checkout, /order by i\.id\s+for update of i/, "ingredient locks use stable UUID order");
assert.ok(checkout.indexOf("NOT_ENOUGH_STOCK") < checkout.indexOf("insert into public.orders"), "all stock validates before mutation");
assert.doesNotMatch(checkout, /public\.process_pos_checkout\(/, "legacy checkout is not the mutation implementation");
assert.match(migration, /set search_path\s*=\s*pg_catalog,\s*pg_temp/g);
for (const section of [checkout, cash, cancellation, close]) assert.match(section, /public\.lock_business_day|public\.assert_business_day_open/, "all mutation paths share the canonical business-day lock");
assert.ok(close.indexOf("public.lock_business_day") < close.indexOf("from public.orders"), "daily close locks before snapshot queries");
assert.match(close, /from public\.cash_movements/);
assert.doesNotMatch(close, /p_snapshot|p_cash_difference/, "daily close never trusts caller calculations");
assert.match(cash, /INVALID_CASH_MOVEMENT_REASON_FOR_TYPE/);
assert.match(cash, /OWNER_REQUIRED_FOR_CASH_MOVEMENT_REASON/);
assert.match(cash, /CASH_MOVEMENT_NOTE_REQUIRED/);
assert.match(cancellation, /cancel_order_without_business_day_guard\(p_order_id,p_reason,p_note,v_role,p_restock\)/);
assert.match(cancellation, /revoke all on function public\.cancel_order_without_business_day_guard[^;]+service_role/i);
assert.doesNotMatch(migration, /failpoint|production[_ -]?fail/i, "migration contains no production failpoints");
console.log("POS atomic checkout static contract passed");
