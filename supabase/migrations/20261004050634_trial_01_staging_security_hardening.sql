-- TRIAL-01: close inherited public-schema exposures before first real trial.
-- Keep legacy data intact; server-side service_role access remains unchanged.

alter table public._backup_shopa_mismatch_ingredient_logs enable row level security;
alter table public._backup_stock_logs_shopa_before_fix enable row level security;
alter table public.ingredient_expiry_settings enable row level security;

revoke all privileges on table public._backup_shopa_mismatch_ingredient_logs from anon, authenticated;
revoke all privileges on table public._backup_stock_logs_shopa_before_fix from anon, authenticated;
revoke all privileges on table public.ingredient_expiry_settings from anon, authenticated;

alter view public.ingredient_lot_expiry_status set (security_invoker = true);
alter view public.ingredient_expiry_summary set (security_invoker = true);
alter view public.v_ingredients_alert set (security_invoker = true);
alter view public.v_user_shop_permissions set (security_invoker = true);

revoke all privileges on table public.ingredient_lot_expiry_status from anon, authenticated;
revoke all privileges on table public.ingredient_expiry_summary from anon, authenticated;
revoke all privileges on table public.v_ingredients_alert from anon, authenticated;
revoke all privileges on table public.v_user_shop_permissions from anon, authenticated;
