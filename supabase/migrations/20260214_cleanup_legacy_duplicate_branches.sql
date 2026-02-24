-- Cleanup legacy duplicate auto-created branches and normalize primary flags.
-- Safe to run multiple times.

-- 1) Remove duplicate auto-created "Main Branch" rows per shop (keep oldest).
with dup_auto as (
  select
    b.id,
    b.shop_id,
    row_number() over (
      partition by b.shop_id
      order by b.created_at asc, b.id asc
    ) as rn
  from public.branch b
  where b.shop_id is not null
    and lower(trim(b.name)) = 'main branch'
    and coalesce(lower(trim(b.address)), '') in ('auto-created branch', '')
),
to_delete as (
  select d.id
  from dup_auto d
  where d.rn > 1
)
delete from public.branch b
using to_delete td
where b.id = td.id;

-- 2) Ensure exactly one primary per shop (prefer existing primary, then oldest row).
with ranked as (
  select
    b.id,
    b.shop_id,
    row_number() over (
      partition by b.shop_id
      order by
        case when coalesce(b.is_primary, false) then 0 else 1 end,
        b.created_at asc,
        b.id asc
    ) as rn
  from public.branch b
  where b.shop_id is not null
)
update public.branch b
set is_primary = (r.rn = 1)
from ranked r
where b.id = r.id;
