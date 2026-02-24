-- Add branch scope to ingredients (and align stock_logs branch backfill).
-- This migration is idempotent and safe to run multiple times.

create extension if not exists pgcrypto;

-- 1) Ingredients: add branch_id
alter table public.ingredients
  add column if not exists branch_id uuid;

-- Backfill branch_id for existing ingredient rows (pick primary branch first).
with picked as (
  select
    i.id as ingredient_id,
    coalesce(
      (
        select b.id
        from public.branch b
        where b.shop_id = i.shop_id
          and coalesce(b.is_primary, false) = true
        order by b.created_at asc, b.id asc
        limit 1
      ),
      (
        select b.id
        from public.branch b
        where b.shop_id = i.shop_id
        order by b.created_at asc, b.id asc
        limit 1
      )
    ) as branch_id
  from public.ingredients i
  where i.shop_id is not null
    and i.branch_id is null
)
update public.ingredients i
set branch_id = p.branch_id
from picked p
where i.id = p.ingredient_id
  and p.branch_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredients_branch_id_fkey'
      and conrelid = 'public.ingredients'::regclass
  ) then
    alter table public.ingredients
      add constraint ingredients_branch_id_fkey
      foreign key (branch_id)
      references public.branch(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_ingredients_shop_branch
  on public.ingredients (shop_id, branch_id);

create index if not exists idx_ingredients_branch
  on public.ingredients (branch_id);

-- 2) stock_logs: ensure branch_id exists and backfill from ingredient branch
alter table public.stock_logs
  add column if not exists branch_id uuid;

update public.stock_logs sl
set branch_id = i.branch_id
from public.ingredients i
where sl.ingredient_id = i.id
  and sl.branch_id is null
  and i.branch_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_logs_branch_id_fkey'
      and conrelid = 'public.stock_logs'::regclass
  ) then
    alter table public.stock_logs
      add constraint stock_logs_branch_id_fkey
      foreign key (branch_id)
      references public.branch(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_stock_logs_shop_branch_created_at
  on public.stock_logs (shop_id, branch_id, created_at desc);
