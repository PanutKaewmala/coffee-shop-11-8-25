-- Expose shop-context helpers only to signed-in app callers and trusted services.
-- RLS invokes these helpers for authenticated requests; anonymous direct RPC
-- invocation is not part of the public API. No business data or row policies change.

alter function public.current_shop_id()
  set search_path = pg_catalog, public, extensions;
alter function public.is_shop_member(uuid)
  set search_path = pg_catalog, public, extensions;
alter function public.is_shop_owner(uuid)
  set search_path = pg_catalog, public, extensions;

revoke execute on function public.current_shop_id() from public, anon;
revoke execute on function public.is_shop_member(uuid) from public, anon;
revoke execute on function public.is_shop_owner(uuid) from public, anon;

grant execute on function public.current_shop_id() to authenticated, service_role;
grant execute on function public.is_shop_member(uuid) to authenticated, service_role;
grant execute on function public.is_shop_owner(uuid) to authenticated, service_role;