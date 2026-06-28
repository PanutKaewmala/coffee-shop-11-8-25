-- RLS hardening for daily_closes
-- Restrict INSERT to draft status only; block DELETE for normal users.

-- Harden INSERT: only draft status allowed (prevents staff creating closed/approved)
drop policy if exists daily_closes_insert_staff on public.daily_closes;
create policy daily_closes_insert_staff
on public.daily_closes
for insert
to authenticated
with check (
  shop_id = current_shop_id()
  and is_staff_in_current_shop()
  and status = 'draft'
);

-- Block DELETE for normal users (service_role retains access via grant)
drop policy if exists daily_closes_delete_owner on public.daily_closes;