-- TRIAL-01: keep authenticated context switching callable while removing anonymous
-- and direct client access that is not part of the trial surface.
--
-- SECURITY DEFINER functions must pin search_path. Trigger helpers do not need
-- client EXECUTE privileges; triggers continue to execute through PostgreSQL.

alter function public.set_current_context(uuid, uuid)
  set search_path = public;

revoke execute on function public.set_current_context(uuid, uuid) from public, anon;
grant execute on function public.set_current_context(uuid, uuid) to authenticated, service_role;

revoke execute on function public.set_current_shop(uuid) from public, anon;
grant execute on function public.set_current_shop(uuid) to authenticated, service_role;

revoke execute on function public.sync_order_items_shop_id() from public, anon, authenticated;
grant execute on function public.sync_order_items_shop_id() to service_role;
