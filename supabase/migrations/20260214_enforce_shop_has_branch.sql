-- Enforce that each shop has at least one branch.
-- 1) Auto-create a default primary branch when a new shop is inserted.
-- 2) Backfill existing shops that currently have no branch.
-- 3) Prevent deleting the last remaining branch of a shop.

create extension if not exists pgcrypto;

-- Ensure primary uniqueness is scoped per shop, not global.
drop index if exists public.branch_one_primary_idx;
create unique index if not exists branch_one_primary_idx
  on public.branch (shop_id)
  where is_primary = true and shop_id is not null;

create or replace function public.ensure_default_branch_for_new_shop()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.branch b
    where b.shop_id = new.id
  ) then
    insert into public.branch (shop_id, name, is_primary, address)
    values (new.id, 'Main Branch', true, null);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ensure_default_branch_for_new_shop on public.shops;
create trigger trg_ensure_default_branch_for_new_shop
after insert on public.shops
for each row
execute function public.ensure_default_branch_for_new_shop();

insert into public.branch (shop_id, name, is_primary, address)
select s.id, 'Main Branch', true, null
from public.shops s
where not exists (
  select 1
  from public.branch b
  where b.shop_id = s.id
);

create or replace function public.prevent_delete_last_branch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.shop_id is null then
    return old;
  end if;

  if not exists (
    select 1
    from public.branch b
    where b.shop_id = old.shop_id
      and b.id <> old.id
  ) then
    raise exception 'At least one branch is required per shop'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_prevent_delete_last_branch on public.branch;
create trigger trg_prevent_delete_last_branch
before delete on public.branch
for each row
execute function public.prevent_delete_last_branch();
