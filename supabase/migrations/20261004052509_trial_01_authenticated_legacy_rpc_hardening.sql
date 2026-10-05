-- TRIAL-01: legacy privileged mutation RPCs are not part of the authenticated app surface.
-- Keep them available to service-role maintenance only.

revoke execute on function public.discard_ingredient_lot(uuid,numeric,text,text) from authenticated;
revoke execute on function public.ensure_default_serve_type(uuid) from authenticated;
revoke execute on function public.mark_ingredient_lot_opened(uuid) from authenticated;

grant execute on function public.discard_ingredient_lot(uuid,numeric,text,text) to service_role;
grant execute on function public.ensure_default_serve_type(uuid) to service_role;
grant execute on function public.mark_ingredient_lot_opened(uuid) to service_role;
