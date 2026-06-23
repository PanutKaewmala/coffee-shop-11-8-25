-- Allow cancel_order to perform controlled stock restoration and stock_logs writes.
-- The function must already exist before this migration runs.
-- The function body, owner, grants, and RLS policies are intentionally unchanged.

alter function public.cancel_order(uuid, text, text, text, boolean)
  security definer;

alter function public.cancel_order(uuid, text, text, text, boolean)
  set search_path = public;
