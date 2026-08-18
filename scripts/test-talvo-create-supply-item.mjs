import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paths = {
    migration: "supabase/migrations/20260817100000_talvo_supply_item_vertical_slice.sql",
    integration: "supabase/tests/talvo_create_supply_item_integration.sql",
    route: "src/app/api/talvo/supply-items/route.ts",
    types: "src/lib/database.types.ts",
    package: "package.json",
};

const migration = readFileSync(paths.migration, "utf8");
const integration = readFileSync(paths.integration, "utf8");
const route = readFileSync(paths.route, "utf8");
const databaseTypes = readFileSync(paths.types, "utf8");
const packageJson = JSON.parse(readFileSync(paths.package, "utf8"));

function includes(source, fragment, label) {
    assert.ok(source.includes(fragment), `Missing ${label}`);
}

function ordered(source, fragments, label) {
    let cursor = -1;
    for (const fragment of fragments) {
        const next = source.indexOf(fragment, cursor + 1);
        assert.ok(next > cursor, `${label}: missing or out of order: ${fragment}`);
        cursor = next;
    }
}

assert.equal(migration.includes("\\"), false, "Migration must not contain psql meta-commands");
assert.equal((migration.match(/\$\$/g) ?? []).length % 2, 0, "Migration dollar quotes are unbalanced");

const tables = [
    "schema_revisions",
    "units",
    "role_capabilities",
    "command_executions",
    "supply_items",
    "ingredient_expiry_policies",
    "ingredient_expiry_policy_versions",
    "ingredient_lots",
    "inventory_locations",
    "inventory_balances",
    "audit_events",
];

for (const table of tables) {
    includes(migration, `create table talvo.${table}`, `talvo.${table}`);
    includes(migration, `alter table talvo.${table} enable row level security`, `RLS on talvo.${table}`);
}

includes(migration, "revoke all on schema talvo from public, anon, authenticated, service_role", "closed TALVO schema ACL");
includes(migration, "unique (business_id, command_name, idempotency_key)", "business-command idempotency uniqueness");
includes(migration, "'actor_id', v_actor_id", "actor identity in request hash");
includes(migration, "on conflict (business_id, command_name, idempotency_key) do nothing", "concurrent idempotency claim");
includes(migration, "return v_existing.result_payload", "stable replay result");
includes(migration, "'IDEMPOTENCY_CONFLICT'", "idempotency conflict response");
includes(migration, "status = 'FAILED', result_payload = v_result", "persisted deterministic failures");
includes(migration, "pg_catalog.trunc(p_quantity_step, v_unit.decimal_scale)", "unit-scale representability validation");
includes(migration, "not p_is_lot_tracked and v_expiry_mode <> 'NON_EXPIRING'", "non-lot expiry invariant");
includes(migration, "talvo_supply_items_active_name_uidx", "case-insensitive active-name namespace");
includes(migration, "talvo_ingredient_lots_system_branch_uidx", "one system lot per branch and item");
includes(migration, "talvo_audit_events_immutable", "immutable audit trigger");
includes(migration, "talvo_supply_item_integrity_from_branch", "active-branch integrity trigger");
includes(migration, "deferrable initially deferred", "deferred cross-row constraints");
includes(migration, "set search_path = pg_catalog, pg_temp", "hardened function search path");
includes(migration, "grant execute on function public.create_talvo_supply_item", "authenticated RPC grant");
includes(migration, "from public, anon, authenticated, service_role", "explicit RPC privilege reset");

for (const seed of [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
]) {
    includes(migration, seed, `canonical unit seed ${seed}`);
}

const commandFunction = migration.slice(migration.indexOf("create function public.create_talvo_supply_item"));
ordered(commandFunction, [
    "from public.shop_members sm",
    "for share of sm",
    "insert into talvo.command_executions",
    "from public.shops s",
    "for update",
    "from talvo.units u",
    "from public.branch b",
    "insert into talvo.supply_items",
    "insert into talvo.ingredient_expiry_policies",
    "insert into talvo.ingredient_expiry_policy_versions",
    "insert into talvo.ingredient_lots",
    "insert into talvo.inventory_balances",
    "insert into talvo.audit_events",
    "status = 'SUCCEEDED'",
], "CreateSupplyItem lock and write contract");

const expectedMetaCommands = [
    String.raw`\set ON_ERROR_STOP on`,
    String.raw`\if :{?talvo_business_id}`,
    String.raw`\else`,
    String.raw`\echo 'talvo_business_id is required'`,
    String.raw`\quit`,
    String.raw`\endif`,
    String.raw`\if :{?talvo_actor_id}`,
    String.raw`\else`,
    String.raw`\echo 'talvo_actor_id is required'`,
    String.raw`\quit`,
    String.raw`\endif`,
    String.raw`\gset`,
    String.raw`\echo 'TALVO CreateSupplyItem integration contract passed (transaction rolled back)'`,
];
const foundMetaCommands = integration
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("\\"));
assert.deepEqual(foundMetaCommands, expectedMetaCommands, "Integration psql meta-command contract changed");
includes(integration, "begin;", "integration transaction start");
includes(integration, "rollback;", "integration rollback");
includes(integration, "IDEMPOTENCY_CONFLICT", "cross-payload and cross-actor replay tests");
includes(integration, "VALIDATION_FAILED", "deterministic validation tests");
includes(integration, "FORBIDDEN", "current authorization test");
includes(integration, "system_untracked_lot_count", "system-lot assertion");
includes(integration, "status = 'FAILED'", "failed execution assertion");

includes(route, "getSupabaseServer", "session-bound Supabase client");
assert.equal(route.includes("getSupabaseAdmin"), false, "TALVO command route must not use service-role client");
includes(route, "getCurrentContextFromCookies", "server-owned business context");
includes(route, "request.headers.get(\"Idempotency-Key\")", "required Idempotency-Key header");
includes(route, "supabase.rpc(\"create_talvo_supply_item\"", "CreateSupplyItem RPC call");
includes(route, "p_business_id: currentShopId", "cookie-derived business ID");
includes(route, "p_quantity_step: body.quantityStep", "decimal quantity forwarding");

includes(databaseTypes, "create_talvo_supply_item:", "generated-compatible RPC type");
includes(databaseTypes, "is_active: boolean", "branch activation type");
assert.equal(
    packageJson.scripts["test:talvo-create-supply-item"],
    "node scripts/test-talvo-create-supply-item.mjs",
    "Package script for the TALVO contract is missing",
);

console.log("TALVO CreateSupplyItem static contract passed");
