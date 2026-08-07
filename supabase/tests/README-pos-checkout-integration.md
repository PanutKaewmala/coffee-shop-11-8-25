# POS checkout database integration plan

Do **not** run the production migration from this test plan. First create an isolated
Supabase branch/local database, apply all migrations there, and seed two shops, two
branches per shop, owner/staff/unknown-role users, menu variants, recipes, ingredients,
and a draft `daily_closes` row for today's Bangkok business date.

Run RPCs with authenticated JWTs (never `service_role`) so `auth.uid()` and role checks
are exercised. Capture baseline counts for `orders`, `order_items`, `stock_logs`,
`pos_idempotency`, and ingredient stock before every scenario.

## Required scenarios

1. **Sweetness lines:** checkout one variant with `(qty=1, sweetness=25%)` and
   `(qty=1, sweetness=100%)`. Assert two `order_items`, labels ending in the correct
   sweetness, deterministic response order `(variant_id, sweetness)`, and one recipe
   deduction based on total quantity 2. Repeat a same-sweetness line and assert it
   aggregates only that sweetness quantity.
2. **Sequential idempotency:** repeat the exact request/key; assert byte-equivalent JSON,
   one order, one set of items/logs, and one stock mutation.
3. **Concurrent idempotency:** release two exact request/key RPC calls together; assert
   both return the same order and only one set of side effects exists.
4. **Payload conflict:** reuse a committed key with changed quantity/sweetness/payment;
   assert `IDEMPOTENCY_CONFLICT` and no additional mutation.
5. **Competing stock:** release two different-key checkouts whose combined requirement
   exceeds stock; assert exactly one commits, one reports insufficient stock, and stock
   remains non-negative.
6. **Rollback after order:** only in the isolated database, install a temporary trigger
   on `order_items` that raises an exception. Call checkout and assert all five baseline
   areas and stock are unchanged; remove the trigger.
7. **Rollback during stock/log:** install a temporary trigger on `stock_logs` that raises
   an exception. Call checkout and assert order/items/idempotency are absent and stock is
   restored by transaction rollback; remove the trigger.
8. **Checkout vs finalization:** use two connections and a barrier to concurrently call
   `process_pos_checkout` and `finalize_daily_close` for the same shop/branch/date.
   Repeat multiple times. The only accepted outcomes are: checkout commits first and
   `paid_order_count`/sales include it, or close commits first and checkout returns
   `BUSINESS_DAY_CLOSED`. A committed order omitted from the closed snapshot is failure.
9. **Direct-RPC authorization:** an authenticated member with an unknown role is denied;
   staff is denied finalization; foreign-shop and foreign-branch arguments are denied.
   Assert every denial leaves all baseline state unchanged.

Use `pg_stat_activity`/`pg_locks` during concurrent cases to confirm advisory waits. Run
all cases again against a staging Supabase project after review, before production rollout.

## Safe rollout order after approval

1. Confirm repository search has no caller of the legacy `(uuid,jsonb)` signature other
   than its migration definition, and confirm with external consumers/job owners.
2. Back up `pos_idempotency`; apply the migration to staging first.
3. Run every scenario above against staging and verify grants/RLS/trigger compatibility.
4. Apply the migration to production **before** deploying the API (current `main` does
   not call the legacy RPC). Do not deploy the new API until migration success is verified.
5. Deploy API/types/tests, perform one controlled checkout, then monitor RPC errors,
   advisory-lock waits, stock invariants, and close snapshots.
6. Roll back the API deployment first if needed; retain the new RPC until callers are
   confirmed migrated. Do not recreate the non-atomic fallback.

## Additional business-day mutation races

10. **Cash movement vs finalization:** release `create_cash_movement_guarded` and
    `finalize_daily_close` together for the same shop/branch/date. Accept only movement
    first with `expected_cash` including it, or close first with
    `BUSINESS_DAY_CLOSED`. Reject any movement committed after the closed snapshot.
11. **Cancellation vs finalization:** create a paid order whose Bangkok business date
    matches the draft close, then release `cancel_order` and finalization together.
    Accept only cancellation first with the finalized report observing cancelled state,
    or close first with cancellation returning `BUSINESS_DAY_CLOSED`. Verify the order,
    cancellation audit, stock restoration, and restoration logs all commit or roll back
    together. Also cover `paid_at is null` to verify the `created_at` fallback date.

Ingredient adjustment is intentionally excluded: it does not affect the Daily Close
financial snapshot and remains a separate follow-up.
