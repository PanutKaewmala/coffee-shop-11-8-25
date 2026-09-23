-- Production compatibility only: legacy branches were usable before is_active existed.
-- Run after the TALVO baseline, before any TALVO supply-item commands/app traffic.
-- One DO statement keeps the preflight, locations and activation atomic.
do $bootstrap$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'TALVO_BRANCH_BOOTSTRAP_REQUIRES_READ_COMMITTED';
  end if;

  -- Serialize with branch/location changes and supply-item creation. Never wait
  -- behind live writes or activate branches based on an unlocked empty-table check.
  lock table public.branch, talvo.supply_items, talvo.inventory_locations
    in share row exclusive mode nowait;

  if exists (select 1 from talvo.supply_items) then
    raise exception 'TALVO_BRANCH_BOOTSTRAP_SUPPLY_ITEMS_EXIST';
  end if;
  if exists (select 1 from public.branch where shop_id is null) then
    raise exception 'TALVO_BRANCH_BOOTSTRAP_BRANCH_WITHOUT_SHOP';
  end if;
  if exists (select 1 from talvo.inventory_locations
    where kind not in ('BRANCH_AVAILABLE', 'BRANCH_QUARANTINE')) then
    raise exception 'TALVO_BRANCH_BOOTSTRAP_UNEXPECTED_LOCATIONS';
  end if;

  -- A retry is a no-op only while the exact completed bootstrap state remains.
  -- In particular, never reactivate a branch deliberately disabled after rollout.
  if not exists (select 1 from public.branch where not is_active)
    and not exists (
      select 1 from public.branch b
      cross join (values ('BRANCH_AVAILABLE'), ('BRANCH_QUARANTINE')) k(kind)
      where (select count(*) from talvo.inventory_locations l
        where l.business_id=b.shop_id and l.branch_id=b.id and l.kind=k.kind) <> 1
    ) then
    return;
  end if;

  if exists (select 1 from public.branch where is_active)
    or exists (select 1 from talvo.inventory_locations) then
    raise exception 'TALVO_BRANCH_BOOTSTRAP_PARTIAL_OR_UNKNOWN_STATE';
  end if;

  insert into talvo.inventory_locations (business_id, branch_id, kind)
  select b.shop_id, b.id, k.kind from public.branch b
  cross join (values ('BRANCH_AVAILABLE'), ('BRANCH_QUARANTINE')) k(kind);

  if exists (
    select 1 from public.branch b
    cross join (values ('BRANCH_AVAILABLE'), ('BRANCH_QUARANTINE')) k(kind)
    where (select count(*) from talvo.inventory_locations l
      where l.business_id=b.shop_id and l.branch_id=b.id and l.kind=k.kind) <> 1
  ) then
    raise exception 'TALVO_BRANCH_BOOTSTRAP_LOCATION_INVARIANT';
  end if;

  update public.branch set is_active=true where not is_active;
end
$bootstrap$;
