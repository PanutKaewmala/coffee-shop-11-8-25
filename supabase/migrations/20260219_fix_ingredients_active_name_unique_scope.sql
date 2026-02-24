-- Fix ingredients active-name uniqueness to be branch-scoped (not shop/global-scoped).
-- Safe to run multiple times.

-- Drop legacy unique constraint/index if present (older environments).
do $$
begin
  if exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.ingredients'::regclass
      and c.conname = 'ingredients_active_name_key_uniq'
  ) then
    alter table public.ingredients
      drop constraint ingredients_active_name_key_uniq;
  end if;
end
$$;

drop index if exists public.ingredients_active_name_key_uniq;

-- New rule: active ingredient name must be unique per shop + branch (case-insensitive, trim-safe).
create unique index if not exists ingredients_active_name_branch_key_uniq
  on public.ingredients (shop_id, branch_id, lower(btrim(name)))
  where coalesce(is_active, true) = true
    and shop_id is not null
    and branch_id is not null;

