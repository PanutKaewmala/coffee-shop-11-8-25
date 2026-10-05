-- TRIAL-01: anonymous callers must not reach privileged mutation RPCs.
-- Authenticated app/server behavior remains available.

revoke execute on function public.discard_ingredient_lot(uuid,numeric,text,text) from public, anon;
revoke execute on function public.ensure_default_serve_type(uuid) from public, anon;
revoke execute on function public.mark_ingredient_lot_opened(uuid) from public, anon;

grant execute on function public.discard_ingredient_lot(uuid,numeric,text,text) to authenticated, service_role;
grant execute on function public.ensure_default_serve_type(uuid) to authenticated, service_role;
grant execute on function public.mark_ingredient_lot_opened(uuid) to authenticated, service_role;
