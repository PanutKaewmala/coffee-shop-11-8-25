# POS checkout integration tests

These checks are designed for an isolated local Supabase database. **Do not run them against staging or production.**

They cover concurrent checkout retries, rollback on insufficient stock, canonical business-day locking across POS, cash movement, daily close and cancellation, cancellation authorization, and distinct order-line identity for the same variant with different sweetness values.

## Suggested local scenarios

1. Submit two concurrent requests with the same `Idempotency-Key`; assert one order and one stock deduction.
2. Submit the same variant at two sweetness levels; assert two order-item lines and a stable replay response.
3. Force a stock failure; assert no order, order item, stock log, or idempotency success row remains.
4. Race checkout/cash movement/cancellation against daily close; assert serialization and no write after close.
5. Verify authenticated shop members can use public RPCs while direct access to `cancel_order_without_business_day_guard` is denied.

Run the repository static tests first with `npm test`, then execute database integration cases only against a disposable local instance.
