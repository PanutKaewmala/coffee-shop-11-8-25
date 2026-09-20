# Sale → Recipe → Inventory

This slice extends the existing POS checkout, branch recipes and inventory models. It does not migrate legacy ingredient quantities into TALVO balances or infer matches by name.

## Transaction

`POST /api/pos` requires an authenticated owner/staff member, an explicitly selected branch, and an idempotency key. A conflicting payload branch is rejected. The route passes the sale intent to `process_pos_checkout_atomic`; prices, recipes, stock validation and writes belong to that database transaction.

The RPC authorizes membership and branch ownership before replay. Its existing shop/key lock and request hash serialize concurrent submissions. An exact retry returns the stored result before reading today's menu or recipe, including after a business day closes. A changed request with the same key is rejected.

The database resolves prices and captures each selected branch/variant recipe once. Every POS variant remains recipe-required. Sweetness is recorded as a sold option; the existing model uses the same ingredient quantities for every sweetness level. Missing, archived, invalid or cross-branch recipe sources cause the entire checkout to fail.

`recipe_items` has one inventory source per row:

- `ingredient_id`: existing branch ingredient stock and stock logs.
- `supply_item_id`: existing TALVO supply item, base unit, lot and inventory balance created/received through CreateSupplyItem and ReceiveSupplyItem. The recipe specifies the branch and base-unit quantity.

TALVO consumption moves quantities from the sale branch's `BRANCH_AVAILABLE` balances to the existing `CONSUMED` location kind. Only active, verified, unexpired lots are eligible. Lots are allocated by receipt creation time and ID, and exact allocations are saved. This is not FEFO. Non-lot items use their existing branch system lot. Legacy ingredients and TALVO balances are never mirrored or deducted twice for one recipe row.

All required stock is checked under locks before the order is inserted. The order, line items, inventory writes, legacy stock logs and idempotency result commit or roll back together. TALVO writes follow the existing business-first locking order shared with receiving; this deliberately serializes mutations within a business.

## Historical explanation

Each order item stores a recipe snapshot: variant, branch, sweetness, recipe content hash, source IDs, ingredient names, base units, per-item quantities and total use. The order stores the actor, branch name, aggregate consumption, balances before/after, and exact TALVO lot/location allocations. These snapshots cannot be rewritten or deleted through normal updates.

The existing order detail page displays the saved recipe and stock left after that sale. Those numbers are explicitly historical, not a claim about current stock after later receipts, sales or cancellations. Old orders without snapshots are labeled unavailable; current recipes are not presented as historical evidence.

Cancellation of a snapshot sale restores its saved quantities/lot allocations once, without reading the current recipe. The existing restock choice and business-day guard remain. Snapshotless legacy cancellation retains its helper with additional shop/branch scoping.

## Retry and access boundaries

The POS persists its unresolved key and exact payload in session storage before sending a checkout. Double submissions are blocked synchronously. Network/5xx/unreadable responses retain that intent across reload, and cart edits remain disabled until the original result is resolved. A confirmed transaction rejection unlocks the cart. Storage failure prevents submission.

The old `POST /api/orders` checkout route returns 405. Direct authenticated order/idempotency writes and legacy checkout/deduction RPCs are revoked. Authorized recipe changes still use the existing owner/member RLS policies. TALVO tables remain private.

## Local validation

Use `scripts/reset-talvo-local-runtime.mjs`, `scripts/configure-talvo-local-env.mjs` and `scripts/seed-talvo-local-browser-fixture.mjs` for the disposable local stack. The reset verifies the schema-only baseline hash and applies the explicit local migration chain. No production rows are copied.

Run `npm run test:pos-interactions`, `npm run test:pos-atomic-checkout`, `npm run test:recipe-inventory`, the local `npm run test:pos-sale-inventory` integration suite, and `npm run verify`. The last command includes lint, type checking, the repository test suite and production build.

## Review considerations

- Existing legacy ingredients and canonical TALVO inventory coexist by explicit recipe source; a later inventory migration needs its own reviewed plan.
- Pre-snapshot historical recipes cannot be reconstructed reliably. Legacy recipe rows with no valid branch are retained and fail closed, requiring owner repair.
- All POS menu variants require recipes, as before. There is no new untracked-menu exception or sweetness multiplier model.
- Receipt-order lot allocation and business-level serialization are intentional limits of this slice. FEFO and broader inventory workflows are outside scope.
- A pending checkout is recoverable within its browser tab's session storage. Clearing browser storage or closing the session loses that client-side recovery handle; server idempotency remains durable for a known key.
- This migration is for review. Deployment requires the repository's protected environment process; no production or staging mutation is part of this work.
