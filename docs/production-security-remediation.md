# Production security remediation and rollout gate

Status date: 2026-10-12. Scope: the existing, populated Production database for project coffee-saas-v1. This report is separate from the disposable-empty-database bootstrap.

## Production changes applied

These changes were applied through Supabase DDL/privilege migrations; no application business rows were inserted, updated, or deleted.

1. Four expiry/permissions views (ingredient_lot_expiry_status, ingredient_expiry_summary, v_ingredients_alert, v_user_shop_permissions) now use security_invoker = true. Direct SELECT was revoked from anon and authenticated. The application expiry endpoints use a server-side admin client.
2. RLS was enabled and API-role privileges revoked on _backup_shopa_mismatch_ingredient_logs, _backup_stock_logs_shopa_before_fix and ingredient_expiry_settings. service_role retains server-side access.
3. Legacy privileged mutation RPCs discard_ingredient_lot, ensure_default_serve_type and mark_ingredient_lot_opened were restricted to service_role.
4. Anonymous EXECUTE was revoked from current_shop_id(), is_shop_member(uuid) and is_shop_owner(uuid); authenticated and service_role retain EXECUTE for RLS and server tasks.
5. search_path was pinned for the reviewed public functions/procedure to pg_catalog, public, extensions.

## Verification evidence

Production Security Advisor now reports zero security ERROR findings. Warnings for function_search_path_mutable and anon_security_definer_function_executable are gone.

Read-only SQL checks confirmed:
- The three tables above have RLS enabled; anon and authenticated have no direct SELECT; service_role retains SELECT.
- All four views have security_invoker=true and do not grant SELECT to anon or authenticated.
- The three shop-context helper RPCs deny anonymous EXECUTE but still allow authenticated and service_role.
- All 21 reviewed functions/procedure have the pinned search_path.

Remaining Advisor findings require contextual handling:
- Fourteen signed-in-callable SECURITY DEFINER RPCs remain. These support core application workflows (POS checkout, stock, daily close and shop context); definitions were inspected for auth.uid() and tenant/role checks. Do not revoke them in bulk just to clear warnings. Any additional restriction needs endpoint-by-endpoint authorization regression tests.
- Fifteen rls_enabled_no_policy INFO findings include the three backup/settings tables (with API-role grants revoked) and internal talvo tables. Do not add permissive USING (true) policies merely to clear INFO findings.
- One auth_leaked_password_protection WARN remains a Supabase Auth dashboard setting. Project owner must enable Authentication > Settings > Password settings > Leaked Password Protection and save it. Official guide: https://supabase.com/docs/guides/auth/password-security.

## Separate rollout blocker: migration provenance

Production is populated and must not run the empty-database bootstrap. The BOOTSTRAP_TARGET_NOT_FRESH guard is correct and must remain.

The custom talvo.schema_revisions ledger contains seven historical rows. Only one hash matches the current checked-in migration source; six hashes do not match the manifest, and the synthetic baseline-artifact row is absent. Searching locally available Git objects did not recover those hashes. This proves a provenance mismatch, not by itself a schema/data defect.

The Supabase-managed CLI migration history was initially absent and was created by subsequent Supabase migration operations. It now contains timestamped operation entries rather than the original repository version strings. harden_shop_helper_rpc_acl was registered twice at different timestamps; its SQL only sets function configuration and grants/revokes privileges, so the second execution was idempotent and did not modify business rows. Preserve the audit entries; do not delete history or fabricate old hashes to force a green check.

## Remaining release criteria

1. Capture an approved Production schema-only snapshot and secure backup; compare actual definitions, grants, policies, triggers and function bodies with migration sources. Keep row data and credentials out of artifacts.
2. Recover the source provenance for the six unmatched hashes from an authoritative deployment artifact/log, or formally approve a catalog-based baseline for the current populated schema. Do not claim current SQL files are the historical versions executed without evidence.
3. Reconcile Supabase CLI migration history to the repository with an explicit reviewed repair plan; preserve existing audit records unless an approved Supabase-supported repair requires otherwise.
4. Run disposable local database integration tests in a verified coffee-saas-v1-local-runtime container. Full canonical bootstrap integration and focused zero-branch integration passed on 2026-10-12 using isolated host ports 55320-55329.
5. Re-run Security Advisor, POS sale/void/retry, inventory receive/usable-stock, branch/shop isolation and daily-close tests after any provenance work.

No Production bootstrap, Production application deployment or business-row mutation was performed in this remediation.
