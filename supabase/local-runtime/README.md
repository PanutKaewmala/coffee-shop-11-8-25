# TALVO local runtime baseline

This directory contains the verified schema-only `public` baseline used only to recreate the current TALVO application locally without touching production.

It is **not** the canonical future TALVO schema.

## Provenance

- Source: production project `coffee-saas-v1` public schema only.
- Capture method: PostgreSQL 17 `pg_dump --schema-only --schema=public --no-owner` in GitHub Actions.
- Verification: workflow rejects top-level `COPY` and `INSERT INTO`, checks required core tables/functions, prints object counts and SHA-256, and uploads a one-day review artifact.
- Captured cutoff: production contains the effects through `20260805083000_update_cash_movements_reason_check_for_categories.sql` and does not contain the effects of `20260807090000_atomic_pos_checkout.sql` or the later TALVO migrations.

The reset script `scripts/reset-talvo-local-runtime.mjs` verifies the recorded SHA-256, sanitizes only pg_dump/role-state statements that are incompatible with a fresh local Supabase stack, and builds an isolated migration chain consisting of this baseline plus:

1. `20260807090000_atomic_pos_checkout.sql`
2. `20260817100000_talvo_supply_item_vertical_slice.sql`
3. `20260819180000_talvo_receive_supply_item.sql`
4. `20260819180100_talvo_receive_history_hardening.sql`
5. `20260910042652_sale_recipe_inventory.sql`
5. `20260910042652_sale_recipe_inventory.sql`

No production application rows are copied.

Run `node scripts/reset-talvo-local-runtime.mjs`, `node scripts/configure-talvo-local-env.mjs`,
and `node scripts/seed-talvo-local-browser-fixture.mjs` to prepare disposable local validation.
Then `npm run test:pos-sale-inventory` runs CreateSupplyItem, ReceiveSupplyItem, transactional
sale contracts, and simultaneous checkout retries. Its Docker target is fixed to the labeled
local runtime container; there is no remote connection option. It leaves isolated concurrency
fixtures only in that disposable database. `npm run verify` remains independent of Docker.
