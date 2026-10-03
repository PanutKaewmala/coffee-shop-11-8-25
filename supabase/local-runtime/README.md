# TALVO canonical local reconstruction

Phase 1 is local/repository only. No remote bootstrap runner or workflow exists.
Reset/integration commands destroy only the disposable `coffee-saas-v1-local-runtime`
platform database. Never substitute a remote URL.

## Canonical sources and order

`supabase/bootstrap/manifest.json` is the executable source/order contract.
`scripts/lib/talvo-bootstrap.mjs` verifies its reviewed fingerprint, source hashes,
duplicates and completeness against post-cutoff repository migrations. Enumeration
finds omissions; it never supplies execution order. Contract changes require review
of the manifest, fingerprint and exact-order tests together.

0. `supabase/local-runtime/production-public-baseline.sql`
1. `20260807090000_atomic_pos_checkout.sql`
2. `20260817100000_talvo_supply_item_vertical_slice.sql`
3. `20260922193511_bootstrap_pre_talvo_branches.sql`
4. `20260819180000_talvo_receive_supply_item.sql`
5. `20260819180100_talvo_receive_history_hardening.sql`
6. `20260910042652_sale_recipe_inventory.sql`
7. `20260921142010_current_usable_stock.sql`

Migration paths are relative to `supabase/migrations`. The late-dated branch
bootstrap follows supply and precedes receive. It actually executes on zero
shops/branches: its guards and NOWAIT locks run, then its completed-state predicate
returns successfully with zero locations. It is never a ledger-only entry.
Future branches need a separate correct location/activation transaction.

## Provenance and baseline adaptation

The repository baseline was historically captured with PostgreSQL 17
`pg_dump --schema-only --schema=public --no-owner`. Its cutoff is `20260805083000`;
its raw SHA-256 is
`f02f683252c165e7508a640d5d6e01f17f3f73c28b76a33e8e5c3e341a2e520c`.
No live database supplies schema and no production rows are copied. This rebuilds
the current compatibility schema, not a redesigned future schema.

HEAD is resolved once. Every SQL source is read from that commit's Git blob;
hashing and execution use those SAME bytes. Checkout CRLF/LF conversion is allowed,
but other edits or missing sources fail closed. The manifest itself is testable
before commit; a future remote entry point must enforce its dispatch/checkout SHA.

The named `supabase-public-v1` adaptation removes exactly:

- two pg_dump `\restrict` / `\unrestrict` commands;
- one `CREATE SCHEMA public;` (the platform already owns public);
- 23 `ALTER DEFAULT PRIVILEGES` statements for postgres/supabase_admin in public
  (platform role-state, not application object privileges).

Baseline output uses LF. All explicit application GRANT/REVOKE statements remain.
After the dump's forward-reference definitions, the runner enables
`check_function_bodies` and `row_security`, sets an explicit search path and bounded
statement/lock/idle timeouts before migrations. Changed adaptations, transaction
commands, psql meta-commands and unsupported SQL constructs fail closed.
No baseline or historical migration file is edited.

## Execution and ledger

Pinned Supabase CLI 2.95.3 prepares an empty local platform without application
migration files or seeds. The shared payload then runs directly through the
verified local Docker container's Unix socket. No connection URL or credential
option exists; remote Docker engines are rejected. One psql session uses `-X`,
`ON_ERROR_STOP`, `--single-transaction -f -`, READ WRITE and READ COMMITTED.

The gate rejects TALVO schemas, non-extension public objects and unexplained
`supabase_migrations.schema_migrations` entries. Required platform roles, auth and
crypto functions must exist. Baseline, all seven migrations, ledger writes,
deferred constraints and assertions share one transaction. Any SQL failure rolls
back application bootstrap. Existing/partial state is rejected, never repaired.
A lost connection during commit is an unknown outcome requiring inspection.

The supply migration creates the actual `talvo.schema_revisions` definition:
`version text` primary key, `source_sha256 text`, `applied_at timestamptz default
clock_timestamp()`, all NOT NULL, with version/hash format checks. No parallel
DDL is invented. After that table exists, pending baseline/atomic/supply entries
are inserted; subsequent rows follow actual migration execution. Conflicts fail;
there are no ledger upserts.

Exactly eight source rows are required:

- `20260805083001`: synthetic **baseline artifact**, hash of the RAW baseline.
  It is NOT historical migration `20260805083000` and claims no individual
  pre-cutoff migration execution.
- Seven original migration versions with exact committed Git-blob SHA-256 values.

Production ledger values and CLI history are never fabricated. The manifest
records order; sorting versions or timestamps is not proof of execution order.
Reset writes ignored `.talvo-local-runtime/bootstrap-receipt.json` with source
commit, adaptation and raw/rendered baseline/payload hashes. Rendered and raw
baseline hashes deliberately describe different things.

## Local validation

- `node scripts/reset-talvo-local-runtime.mjs`: reset/reconstruct and verify schema,
  zero business rows and all eight ledger entries after commit.
- `node scripts/reset-talvo-local-runtime.mjs --prepare-only`: destructive local
  platform preparation without application SQL, used by the integration harness.
- `npm run test:talvo-bootstrap`: source/order/adaptation tests, CRLF/LF independence
  and deliberate manifest mutation detection, without database access.
- `npm run test:talvo-bootstrap:integration`: full empty reconstruction, faults
  after every source, skipped-bootstrap detection, partial-state rejection and
  exact ledger/zero-business-row proof on the disposable local platform.
- `npm run test:pre-talvo-branch-bootstrap:integration`: focused local tests,
  including real zero-shop/zero-branch execution.

After empty reconstruction, configure local-only `.env.local` and run
`node scripts/seed-talvo-local-browser-fixture.mjs` separately. Then run
`npm run test:pos-sale-inventory` (includes CreateSupplyItem/ReceiveSupplyItem SQL
contracts) and `npm run test:usable-stock:integration`. These add local fixtures;
they are distinct from proving reconstruction leaves no business rows.

`npm run verify` includes static/bootstrap tests, lint, typecheck and build. Its
existing workflow behavioral tests require Python and Docker but use fake
credentials with networking disabled. Destructive database integration tests
remain explicit separate commands, not part of `npm run verify`.
