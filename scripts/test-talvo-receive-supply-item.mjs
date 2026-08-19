import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260819180000_talvo_receive_supply_item.sql", "utf8");
const hardening = readFileSync("supabase/migrations/20260819180100_talvo_receive_history_hardening.sql", "utf8");
const source = `${migration}\n${hardening}`;

function includes(fragment, label) {
  assert.ok(source.includes(fragment), `Missing ${label}`);
}
function ordered(fragments, label) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = migration.indexOf(fragment, cursor + 1);
    assert.ok(next > cursor, `${label}: missing/out of order: ${fragment}`);
    cursor = next;
  }
}

assert.equal(source.includes("\\set"), false, "Migrations must not contain psql meta-commands");
assert.equal((source.match(/\$\$/g) ?? []).length % 2, 0, "Migration dollar quotes are unbalanced");
includes("inventory.stock.receive", "receive capability");
includes("for update of sm", "membership authorization lock");
includes("on conflict (business_id, command_name, idempotency_key) do nothing", "concurrent idempotency claim");
includes("'IDEMPOTENCY_CONFLICT'", "idempotency conflict");
includes("return v_existing.result_payload", "stable replay result");
includes("pg_catalog.trunc(p_quantity_base, v_unit.decimal_scale)", "unit decimal-scale validation");
includes("pg_catalog.mod(p_quantity_base, v_supply_item.quantity_step) <> 0", "quantity-step validation");
includes("BALANCE_LIMIT_EXCEEDED", "balance overflow domain error");
includes("v_balance.quantity_base + p_quantity_base > v_max_balance", "balance overflow precondition");
includes("v_policy_version.mode = 'REQUIRED_USE_BY'", "required-use-by handling");
includes("effective_use_by_at", "effective expiry persistence");
includes("Canonical non-lot system lot is inconsistent", "fail-closed system lot validation");
includes("Canonical non-lot inventory balance is missing", "fail-closed system balance validation");
includes("quantity_base = quantity_base + p_quantity_base", "atomic balance increment");
includes("version = version + 1", "balance version increment");
includes("TALVO_INGREDIENT_LOT_HISTORY_IMMUTABLE", "lot immutable-history guard");
includes("TALVO_EXPIRY_POLICY_VERSION_HISTORY_IMMUTABLE", "policy immutable-history guard");
includes("before delete on talvo.ingredient_lots", "lot delete guard");
includes("before delete on talvo.ingredient_expiry_policy_versions", "activated policy delete guard");
includes("new.id is distinct from old.id", "lot primary-key immutability");
includes("grant execute on function public.receive_talvo_supply_item", "authenticated RPC grant");
includes("from public, anon, authenticated, service_role", "explicit RPC privilege reset");
includes("set search_path = pg_catalog, pg_temp", "hardened security-definer search path");

const fn = migration.slice(migration.indexOf("create function public.receive_talvo_supply_item"));
ordered([
  "from public.shop_members sm",
  "for update of sm",
  "insert into talvo.command_executions",
  "from public.shops s",
  "from public.branch b",
  "from talvo.supply_items si",
  "from talvo.ingredient_expiry_policies ep",
  "from talvo.ingredient_expiry_policy_versions epv",
  "from talvo.inventory_locations il",
  "from talvo.ingredient_lots lot",
  "from talvo.inventory_balances ib",
  "insert into talvo.audit_events",
  "status = 'SUCCEEDED'",
], "ReceiveSupplyItem lock/write contract");

assert.ok(fn.includes("insert into talvo.ingredient_lots"), "Lot-tracked receipt must create a root lot");
assert.ok(fn.includes("insert into talvo.inventory_balances"), "Lot-tracked receipt must create available balance");
assert.ok(fn.includes("system_branch_id = p_branch_id"), "Non-lot receipt must resolve branch system lot");
assert.ok(fn.includes("status = 'FAILED', result_payload = v_result"), "Deterministic failures must persist");

console.log("TALVO ReceiveSupplyItem static contract passed");
