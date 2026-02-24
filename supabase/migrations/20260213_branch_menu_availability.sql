-- Branch-level menu visibility
-- Model: default-closed for branch-scoped screens.
-- If no row exists for (branch_id, menu_id), menu is treated as disabled.

create extension if not exists pgcrypto;

create table if not exists public.branch_menu_availability (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete cascade,
  menu_id uuid not null references public.menu(id) on delete cascade,
  shop_id uuid not null default current_shop_id() references public.shops(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, menu_id)
);

create index if not exists idx_branch_menu_availability_branch
  on public.branch_menu_availability (branch_id);

create index if not exists idx_branch_menu_availability_menu
  on public.branch_menu_availability (menu_id);

create index if not exists idx_branch_menu_availability_shop_branch
  on public.branch_menu_availability (shop_id, branch_id);

alter table public.branch_menu_availability enable row level security;

drop policy if exists branch_menu_availability_select_staff on public.branch_menu_availability;
create policy branch_menu_availability_select_staff
on public.branch_menu_availability
for select
to authenticated
using (
  shop_id = current_shop_id()
  and is_staff_in_current_shop()
);

drop policy if exists branch_menu_availability_insert_owner on public.branch_menu_availability;
create policy branch_menu_availability_insert_owner
on public.branch_menu_availability
for insert
to authenticated
with check (
  shop_id = current_shop_id()
  and is_owner_in_current_shop()
);

drop policy if exists branch_menu_availability_update_owner on public.branch_menu_availability;
create policy branch_menu_availability_update_owner
on public.branch_menu_availability
for update
to authenticated
using (
  shop_id = current_shop_id()
  and is_owner_in_current_shop()
)
with check (
  shop_id = current_shop_id()
  and is_owner_in_current_shop()
);

drop policy if exists branch_menu_availability_delete_owner on public.branch_menu_availability;
create policy branch_menu_availability_delete_owner
on public.branch_menu_availability
for delete
to authenticated
using (
  shop_id = current_shop_id()
  and is_owner_in_current_shop()
);

grant select, insert, update, delete
on table public.branch_menu_availability
to authenticated;

grant all
on table public.branch_menu_availability
to service_role;
