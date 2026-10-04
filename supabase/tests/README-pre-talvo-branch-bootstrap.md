# Pre-TALVO branch compatibility bootstrap

`20260922193511_bootstrap_pre_talvo_branches.sql` restores the usable semantics of
branches that existed before TALVO added `branch.is_active DEFAULT false`.
It is a one-time rollout compatibility step, not a branch-management workflow.

## Preconditions and invariants

- Apply the reviewed TALVO baseline first. Verify its source checksum and schema
  constraints/triggers using the protected rollout process; do not use this file
  to repair a missing or modified baseline.
- The initial state must have no TALVO supply items (including archived items),
  all branches inactive, every branch attached to a shop, and no TALVO locations.
- Each branch receives exactly one `BRANCH_AVAILABLE` and one
  `BRANCH_QUARANTINE`, owned by its shop, before activation. Primary and secondary
  branches are both preserved. Names, ownership and other branch fields stay intact.
- The only accepted retry state is all branches active with exactly both locations
  and still no supply items or other location kinds. It makes no changes. A partial
  setup or later branch deactivation is rejected, never silently repaired.
- The migration is one atomic DO statement. READ COMMITTED and NOWAIT table locks
  prevent stale preflight reads and concurrent branch, supply-item or location writes.
  Lock contention fails instead of waiting behind live writes. See PostgreSQL's
  [LOCK documentation](https://www.postgresql.org/docs/current/sql-lock.html).
- No balances, lots, history, grants, RLS policies or baseline triggers are changed.

## Required rollout position

Keep application deployment and TALVO writes blocked. Verify the target identity,
baseline checksum, prerequisites and migration ledger first. Rehearse in staging
with the same reviewed migration bytes and protected approvals/serialization.

Apply this compatibility step **after the TALVO baseline and before the first
CreateSupplyItem/receiving/POS use or application deployment that requires active
TALVO branches**. Its newer filename does not mean it can run after operational
data has been created. Later schema-only migrations may precede it only if the
strict pre-bootstrap data state still holds. Do not blindly push the historical
migration directory into an existing production database.

Execute it through the approved migration runner, with fail-on-error and migration
history/checksum recording in the same transaction. Verify the branch/location
invariants before releasing writes. PR #53 additionally requires its own usable-stock
migration and RPC verification before the application is deployed. The obsolete supply/receiving staging workflows have been removed. Phase 1
provides only local reconstruction, with no remote bootstrap authorization.

Do not deactivate branches as an automatic rollback after TALVO writes begin.
Before commit, rollback removes activation and new locations together; after commit,
retain the compatible schema/data when rolling back application code.

## Focused local verification

Run `npm run test:pre-talvo-branch-bootstrap:integration` with the disposable
`coffee-saas-v1-local-runtime` Docker database running. No environment credentials
or remote targets are accepted. The test creates a random temporary database,
installs a minimal legacy public contract plus the unmodified real TALVO baseline,
and drops only that temporary database afterward. It tests multi-tenant branches,
activation order, unchanged retries, partial/unsafe states, archived supply items,
rollback, and a concurrent writer. It does not reset the existing local fixture DB.

This test is separate from `npm run verify`. The latter includes workflow
behavioral tests requiring Python and Docker (fake credentials, no network),
but not destructive database integration tests.
No remote rollout is authorized or performed by this proposal.

## Canonical empty reconstruction

The shared contract is `supabase/bootstrap/manifest.json`: public baseline, atomic
POS, supply slice, **branch bootstrap**, receive, receive hardening, sale/recipe,
then usable stock. See `supabase/local-runtime/README.md` for exact paths, reviewed
baseline adaptation, Git-blob provenance and the eight-row source ledger.

The real branch DO block executes even with zero shops/branches. Its READ COMMITTED
check and locks run before returning without rows. The focused test proves this
with its three actual relation locks. The full local bootstrap test also detects
removal of this block and checks rollback, partial targets and exact source hashes.

The shared runner records seven migrations plus synthetic baseline artifact
`20260805083001`, never historical cutoff migration `20260805083000`. Committed
Git blobs supply hashed AND executed migration bytes, independent of checkout
line endings. No production ledger or database is a provenance source.
