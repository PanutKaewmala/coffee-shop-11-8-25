-- Pin function/procedure name resolution to trusted schemas.
-- This is forward-only and does not change business data or grants.
-- pg_catalog is explicit, application objects resolve from public, and extension
-- functions remain available through the extensions schema.

alter function public.adjust_stock(uuid, numeric, text)
  set search_path = pg_catalog, public, extensions;

alter procedure public.apply_shop_rls(text)
  set search_path = pg_catalog, public, extensions;

alter function public.block_system_menu_serve_types_mutation()
  set search_path = pg_catalog, public, extensions;

alter function public.current_branch_id()
  set search_path = pg_catalog, public, extensions;

alter function public.discard_ingredient_lot(uuid, numeric, text, text)
  set search_path = pg_catalog, public, extensions;

alter function public.ensure_default_serve_type(uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.get_expiry_alert_summary(uuid, uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.increment_stock(uuid, numeric)
  set search_path = pg_catalog, public, extensions;

alter function public.ingredients_set_name_key()
  set search_path = pg_catalog, public, extensions;

alter function public.is_admin()
  set search_path = pg_catalog, public, extensions;

alter function public.is_owner_in_current_shop()
  set search_path = pg_catalog, public, extensions;

alter function public.is_staff_in_current_shop()
  set search_path = pg_catalog, public, extensions;

alter function public.log_stock_add()
  set search_path = pg_catalog, public, extensions;

alter function public.mark_ingredient_lot_opened(uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.revenue_summary_range(timestamp with time zone, timestamp with time zone, text)
  set search_path = pg_catalog, public, extensions;

alter function public.set_updated_at()
  set search_path = pg_catalog, public, extensions;

alter function public.tg_menu_variants_prevent_default_loss()
  set search_path = pg_catalog, public, extensions;

alter function public.tg_menu_variants_single_default()
  set search_path = pg_catalog, public, extensions;