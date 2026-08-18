-- TALVO backend vertical slice: CreateSupplyItem.
--
-- This migration deliberately exposes one authenticated RPC and no direct
-- access to the talvo schema. The staging workflow applies this file in one
-- outer transaction and records its source SHA-256 separately.

create schema talvo;

revoke all on schema talvo from public, anon, authenticated, service_role;

alter table public.branch
  add column is_active boolean not null default false;

create unique index branch_shop_id_id_uidx
  on public.branch (shop_id, id);

create table talvo.schema_revisions (
  version text primary key,
  source_sha256 text not null,
  applied_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint talvo_schema_revisions_version_check
    check (version ~ '^[0-9]{14}$'),
  constraint talvo_schema_revisions_sha256_check
    check (source_sha256 ~ '^[0-9a-f]{64}$')
);

create table talvo.units (
  id uuid primary key,
  dimension text not null,
  symbol text not null unique,
  decimal_scale smallint not null,
  constraint talvo_units_dimension_check
    check (dimension in ('VOLUME', 'MASS', 'COUNT')),
  constraint talvo_units_decimal_scale_check
    check (decimal_scale between 0 and 6)
);

create table talvo.role_capabilities (
  role text not null,
  capability text not null,
  primary key (role, capability),
  constraint talvo_role_capabilities_role_check
    check (role = pg_catalog.btrim(role) and pg_catalog.length(role) between 1 and 64),
  constraint talvo_role_capabilities_capability_check
    check (capability = pg_catalog.btrim(capability) and pg_catalog.length(capability) between 1 and 128)
);

create table talvo.command_executions (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null,
  actor_id uuid not null,
  command_name text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null,
  result_payload jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  constraint talvo_command_executions_business_fk
    foreign key (business_id)
    references public.shops(id)
    deferrable initially deferred,
  constraint talvo_command_executions_command_name_check
    check (command_name = pg_catalog.btrim(command_name) and pg_catalog.length(command_name) between 1 and 128),
  constraint talvo_command_executions_idempotency_key_check
    check (
      idempotency_key = pg_catalog.btrim(idempotency_key)
      and pg_catalog.length(idempotency_key) between 8 and 128
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    ),
  constraint talvo_command_executions_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint talvo_command_executions_status_check
    check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  constraint talvo_command_executions_completion_check
    check (
      (status = 'RUNNING' and result_payload is null and completed_at is null)
      or
      (status in ('SUCCEEDED', 'FAILED') and result_payload is not null and completed_at is not null)
    ),
  unique (business_id, command_name, idempotency_key),
  unique (business_id, id, actor_id)
);

create table talvo.supply_items (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null,
  name text not null,
  base_unit_id uuid not null,
  quantity_step numeric(18,6) not null,
  is_lot_tracked boolean not null,
  revision integer not null default 1,
  archived_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint talvo_supply_items_business_fk
    foreign key (business_id) references public.shops(id),
  constraint talvo_supply_items_base_unit_fk
    foreign key (base_unit_id) references talvo.units(id),
  constraint talvo_supply_items_name_check
    check (name = pg_catalog.btrim(name) and pg_catalog.length(name) between 1 and 160),
  constraint talvo_supply_items_quantity_step_check
    check (quantity_step > 0),
  constraint talvo_supply_items_revision_check
    check (revision > 0),
  unique (business_id, id)
);

create unique index talvo_supply_items_active_name_uidx
  on talvo.supply_items (business_id, pg_catalog.lower(name))
  where archived_at is null;

create table talvo.ingredient_expiry_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null,
  supply_item_id uuid not null,
  revision integer not null default 1,
  created_by uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint talvo_expiry_policies_supply_item_fk
    foreign key (business_id, supply_item_id)
    references talvo.supply_items(business_id, id),
  constraint talvo_expiry_policies_revision_check
    check (revision > 0),
  unique (business_id, supply_item_id),
  unique (business_id, id),
  unique (business_id, id, supply_item_id)
);

create table talvo.ingredient_expiry_policy_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null,
  ingredient_expiry_policy_id uuid not null,
  supply_item_id uuid not null,
  version_number integer not null,
  status text not null,
  mode text not null,
  created_by uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  activated_at timestamptz,
  archived_at timestamptz,
  constraint talvo_expiry_policy_versions_policy_fk
    foreign key (business_id, ingredient_expiry_policy_id, supply_item_id)
    references talvo.ingredient_expiry_policies(business_id, id, supply_item_id),
  constraint talvo_expiry_policy_versions_number_check
    check (version_number > 0),
  constraint talvo_expiry_policy_versions_status_check
    check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  constraint talvo_expiry_policy_versions_mode_check
    check (mode in ('REQUIRED_USE_BY', 'NON_EXPIRING')),
  constraint talvo_expiry_policy_versions_lifecycle_check
    check (
      (status = 'DRAFT' and activated_at is null and archived_at is null)
      or
      (status = 'ACTIVE' and activated_at is not null and archived_at is null)
      or
      (status = 'ARCHIVED' and activated_at is not null and archived_at is not null)
  ),
  unique (ingredient_expiry_policy_id, version_number),
  unique (business_id, id),
  unique (business_id, id, supply_item_id)
);

create unique index talvo_expiry_policy_versions_one_active_uidx
  on talvo.ingredient_expiry_policy_versions (ingredient_expiry_policy_id)
  where status = 'ACTIVE';

create table talvo.ingredient_lots (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null,
  supply_item_id uuid not null,
  expiry_policy_version_id uuid not null,
  parent_lot_id uuid,
  root_lot_id uuid not null,
  system_branch_id uuid,
  provenance_source_ref text not null,
  external_batch_code text,
  provenance_status text not null,
  manufacturer_use_by_at timestamptz,
  effective_use_by_at timestamptz,
  status text not null,
  created_by uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint talvo_ingredient_lots_supply_item_fk
    foreign key (business_id, supply_item_id)
    references talvo.supply_items(business_id, id),
  constraint talvo_ingredient_lots_expiry_version_fk
    foreign key (business_id, expiry_policy_version_id, supply_item_id)
    references talvo.ingredient_expiry_policy_versions(business_id, id, supply_item_id),
  constraint talvo_ingredient_lots_system_branch_fk
    foreign key (business_id, system_branch_id)
    references public.branch(shop_id, id),
  constraint talvo_ingredient_lots_provenance_status_check
    check (provenance_status in ('VERIFIED', 'UNVERIFIED')),
  constraint talvo_ingredient_lots_status_check
    check (status in ('ACTIVE', 'RECALLED')),
  constraint talvo_ingredient_lots_source_ref_check
    check (
      provenance_source_ref = pg_catalog.btrim(provenance_source_ref)
      and pg_catalog.length(provenance_source_ref) between 1 and 512
    ),
  constraint talvo_ingredient_lots_system_shape_check
    check (
      system_branch_id is null
      or (
        parent_lot_id is null
        and root_lot_id = id
        and external_batch_code is null
        and provenance_status = 'VERIFIED'
        and manufacturer_use_by_at is null
        and effective_use_by_at is null
        and status = 'ACTIVE'
      )
    ),
  unique (business_id, id),
  unique (business_id, id, supply_item_id)
);

alter table talvo.ingredient_lots
  add constraint talvo_ingredient_lots_parent_fk
    foreign key (business_id, parent_lot_id, supply_item_id)
    references talvo.ingredient_lots(business_id, id, supply_item_id),
  add constraint talvo_ingredient_lots_root_fk
    foreign key (business_id, root_lot_id, supply_item_id)
    references talvo.ingredient_lots(business_id, id, supply_item_id)
    deferrable initially deferred;

create unique index talvo_ingredient_lots_system_branch_uidx
  on talvo.ingredient_lots (business_id, supply_item_id, system_branch_id)
  where system_branch_id is not null;

create table talvo.inventory_locations (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null,
  branch_id uuid,
  kind text not null,
  reference_id uuid,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint talvo_inventory_locations_business_fk
    foreign key (business_id) references public.shops(id),
  constraint talvo_inventory_locations_branch_fk
    foreign key (business_id, branch_id)
    references public.branch(shop_id, id),
  constraint talvo_inventory_locations_kind_check
    check (
      kind in (
        'BRANCH_AVAILABLE', 'ORDER_COMMITTED', 'BRANCH_QUARANTINE', 'IN_TRANSIT',
        'CONSUMED', 'RAW_WASTE', 'TRANSFER_LOSS', 'ADJUSTMENT'
      )
    ),
  constraint talvo_inventory_locations_shape_check
    check (
      (kind in ('BRANCH_AVAILABLE', 'BRANCH_QUARANTINE') and branch_id is not null and reference_id is null)
      or
      (kind = 'ORDER_COMMITTED' and branch_id is not null and reference_id is not null)
      or
      (kind = 'IN_TRANSIT' and branch_id is null and reference_id is not null)
      or
      (kind in ('CONSUMED', 'RAW_WASTE', 'TRANSFER_LOSS', 'ADJUSTMENT') and branch_id is null and reference_id is null)
    ),
  unique (business_id, id)
);

create unique index talvo_inventory_locations_branch_kind_uidx
  on talvo.inventory_locations (business_id, branch_id, kind)
  where kind in ('BRANCH_AVAILABLE', 'BRANCH_QUARANTINE');

create unique index talvo_inventory_locations_reference_uidx
  on talvo.inventory_locations (business_id, kind, reference_id)
  where reference_id is not null;

create unique index talvo_inventory_locations_terminal_uidx
  on talvo.inventory_locations (business_id, kind)
  where kind in ('CONSUMED', 'RAW_WASTE', 'TRANSFER_LOSS', 'ADJUSTMENT');

create table talvo.inventory_balances (
  business_id uuid not null,
  location_id uuid not null,
  ingredient_lot_id uuid not null,
  quantity_base numeric(18,6) not null default 0,
  version bigint not null default 1,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (location_id, ingredient_lot_id),
  constraint talvo_inventory_balances_location_fk
    foreign key (business_id, location_id)
    references talvo.inventory_locations(business_id, id),
  constraint talvo_inventory_balances_lot_fk
    foreign key (business_id, ingredient_lot_id)
    references talvo.ingredient_lots(business_id, id),
  constraint talvo_inventory_balances_quantity_check
    check (quantity_base >= 0),
  constraint talvo_inventory_balances_version_check
    check (version > 0)
);

create table talvo.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null,
  command_execution_id uuid not null,
  actor_id uuid not null,
  capability text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  action text not null,
  payload jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint talvo_audit_events_execution_fk
    foreign key (business_id, command_execution_id, actor_id)
    references talvo.command_executions(business_id, id, actor_id),
  constraint talvo_audit_events_capability_check
    check (capability = pg_catalog.btrim(capability) and pg_catalog.length(capability) between 1 and 128),
  constraint talvo_audit_events_aggregate_type_check
    check (aggregate_type = pg_catalog.btrim(aggregate_type) and pg_catalog.length(aggregate_type) between 1 and 128),
  constraint talvo_audit_events_action_check
    check (action = pg_catalog.btrim(action) and pg_catalog.length(action) between 1 and 128)
);

insert into talvo.units(id, dimension, symbol, decimal_scale) values
  ('10000000-0000-4000-8000-000000000001', 'VOLUME', 'ml', 3),
  ('10000000-0000-4000-8000-000000000002', 'MASS', 'g', 3),
  ('10000000-0000-4000-8000-000000000003', 'COUNT', 'piece', 0);

insert into talvo.role_capabilities(role, capability)
values ('owner', 'inventory.supply_item.create');

alter table talvo.schema_revisions enable row level security;
alter table talvo.units enable row level security;
alter table talvo.role_capabilities enable row level security;
alter table talvo.command_executions enable row level security;
alter table talvo.supply_items enable row level security;
alter table talvo.ingredient_expiry_policies enable row level security;
alter table talvo.ingredient_expiry_policy_versions enable row level security;
alter table talvo.ingredient_lots enable row level security;
alter table talvo.inventory_locations enable row level security;
alter table talvo.inventory_balances enable row level security;
alter table talvo.audit_events enable row level security;

revoke all on all tables in schema talvo from public, anon, authenticated, service_role;
revoke all on all sequences in schema talvo from public, anon, authenticated, service_role;

alter default privileges in schema talvo
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema talvo
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema talvo
  revoke all on functions from public, anon, authenticated, service_role;

create function talvo.command_error(p_code text, p_message text)
returns jsonb
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.jsonb_build_object(
    'ok', false,
    'error', pg_catalog.jsonb_build_object('code', p_code, 'message', p_message)
  )
$$;

create function talvo.reject_audit_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'TALVO_AUDIT_EVENT_IMMUTABLE' using errcode = '55000';
end
$$;

create trigger talvo_audit_events_immutable
before update or delete on talvo.audit_events
for each row
execute function talvo.reject_audit_event_mutation();

create function talvo.assert_business_supply_item_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_business_id uuid;
begin
  v_business_id := case when tg_op = 'DELETE' then old.business_id else new.business_id end;

  if exists (
    select 1
    from talvo.supply_items si
    where si.business_id = v_business_id
      and si.archived_at is null
      and (
        (
          select pg_catalog.count(*)
          from talvo.ingredient_expiry_policies ep
          join talvo.ingredient_expiry_policy_versions epv
            on epv.business_id = ep.business_id
           and epv.ingredient_expiry_policy_id = ep.id
           and epv.supply_item_id = ep.supply_item_id
           and epv.status = 'ACTIVE'
          where ep.business_id = si.business_id
            and ep.supply_item_id = si.id
        ) <> 1
        or (
          not si.is_lot_tracked
          and not exists (
            select 1
            from talvo.ingredient_expiry_policies ep
            join talvo.ingredient_expiry_policy_versions epv
              on epv.business_id = ep.business_id
             and epv.ingredient_expiry_policy_id = ep.id
             and epv.supply_item_id = ep.supply_item_id
            where ep.business_id = si.business_id
              and ep.supply_item_id = si.id
              and epv.status = 'ACTIVE'
              and epv.mode = 'NON_EXPIRING'
          )
        )
        or (
          not si.is_lot_tracked
          and exists (
            select 1
            from public.branch b
            where b.shop_id = si.business_id
              and b.is_active
              and not exists (
                select 1
                from talvo.ingredient_lots lot
                join talvo.inventory_balances ib
                  on ib.business_id = lot.business_id
                 and ib.ingredient_lot_id = lot.id
                join talvo.inventory_locations il
                  on il.business_id = ib.business_id
                 and il.id = ib.location_id
                 and il.kind = 'BRANCH_AVAILABLE'
                 and il.branch_id = b.id
                where lot.business_id = si.business_id
                  and lot.supply_item_id = si.id
                  and lot.system_branch_id = b.id
                  and lot.provenance_status = 'VERIFIED'
                  and lot.manufacturer_use_by_at is null
                  and lot.effective_use_by_at is null
              )
          )
        )
      )
  ) then
    raise exception 'TALVO_SUPPLY_ITEM_INTEGRITY_VIOLATION' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create constraint trigger talvo_supply_items_integrity
after insert or update or delete on talvo.supply_items
deferrable initially deferred
for each row
execute function talvo.assert_business_supply_item_integrity();

create constraint trigger talvo_expiry_policies_integrity
after insert or update or delete on talvo.ingredient_expiry_policies
deferrable initially deferred
for each row
execute function talvo.assert_business_supply_item_integrity();

create constraint trigger talvo_expiry_policy_versions_integrity
after insert or update or delete on talvo.ingredient_expiry_policy_versions
deferrable initially deferred
for each row
execute function talvo.assert_business_supply_item_integrity();

create constraint trigger talvo_ingredient_lots_integrity
after insert or update or delete on talvo.ingredient_lots
deferrable initially deferred
for each row
execute function talvo.assert_business_supply_item_integrity();

create constraint trigger talvo_inventory_balances_integrity
after insert or update or delete on talvo.inventory_balances
deferrable initially deferred
for each row
execute function talvo.assert_business_supply_item_integrity();

create function talvo.assert_active_branch_inventory_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not new.is_active then
    return new;
  end if;

  if (
    select pg_catalog.count(*)
    from talvo.inventory_locations il
    where il.business_id = new.shop_id
      and il.branch_id = new.id
      and il.kind in ('BRANCH_AVAILABLE', 'BRANCH_QUARANTINE')
  ) <> 2 then
    raise exception 'TALVO_ACTIVE_BRANCH_LOCATION_INTEGRITY_VIOLATION' using errcode = '23514';
  end if;

  if exists (
    select 1
    from talvo.supply_items si
    where si.business_id = new.shop_id
      and si.archived_at is null
      and not si.is_lot_tracked
      and not exists (
        select 1
        from talvo.ingredient_lots lot
        join talvo.inventory_balances ib
          on ib.business_id = lot.business_id
         and ib.ingredient_lot_id = lot.id
        join talvo.inventory_locations il
          on il.business_id = ib.business_id
         and il.id = ib.location_id
         and il.kind = 'BRANCH_AVAILABLE'
         and il.branch_id = new.id
        where lot.business_id = si.business_id
          and lot.supply_item_id = si.id
          and lot.system_branch_id = new.id
      )
  ) then
    raise exception 'TALVO_ACTIVE_BRANCH_LOT_INTEGRITY_VIOLATION' using errcode = '23514';
  end if;

  return new;
end
$$;

create constraint trigger talvo_supply_item_integrity_from_branch
after insert or update of shop_id, is_active on public.branch
deferrable initially deferred
for each row
execute function talvo.assert_active_branch_inventory_integrity();

create function public.create_talvo_supply_item(
  p_business_id uuid,
  p_name text,
  p_base_unit_id uuid,
  p_quantity_step numeric,
  p_is_lot_tracked boolean,
  p_initial_expiry_mode text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_member_role text;
  v_capability constant text := 'inventory.supply_item.create';
  v_command_name constant text := 'CreateSupplyItem';
  v_normalized_name text := pg_catalog.btrim(p_name);
  v_expiry_mode text := pg_catalog.upper(pg_catalog.btrim(p_initial_expiry_mode));
  v_request_hash text;
  v_execution_id uuid;
  v_existing talvo.command_executions%rowtype;
  v_unit talvo.units%rowtype;
  v_branch_ids uuid[] := array[]::uuid[];
  v_branch_id uuid;
  v_available_location_id uuid;
  v_supply_item_id uuid := extensions.gen_random_uuid();
  v_expiry_policy_id uuid := extensions.gen_random_uuid();
  v_expiry_policy_version_id uuid := extensions.gen_random_uuid();
  v_lot_id uuid;
  v_lot_count integer := 0;
  v_result jsonb;
  v_now timestamptz;
begin
  if v_actor_id is null then
    return talvo.command_error('FORBIDDEN', 'Current actor is not authenticated');
  end if;

  select sm.role
  into v_member_role
  from public.shop_members sm
  where sm.shop_id = p_business_id
    and sm.user_id = v_actor_id
  for share of sm;

  if v_member_role is null or not exists (
    select 1
    from talvo.role_capabilities rc
    where rc.role = v_member_role
      and rc.capability = v_capability
  ) then
    return talvo.command_error('FORBIDDEN', 'Current actor lacks inventory.supply_item.create');
  end if;

  if p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.length(p_idempotency_key) not between 8 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    return talvo.command_error('VALIDATION_FAILED', 'Idempotency key is invalid');
  end if;

  v_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'business_id', p_business_id,
          'actor_id', v_actor_id,
          'name', v_normalized_name,
          'base_unit_id', p_base_unit_id,
          'quantity_step', p_quantity_step,
          'is_lot_tracked', p_is_lot_tracked,
          'initial_expiry_mode', v_expiry_mode
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into talvo.command_executions(
    business_id, actor_id, command_name, idempotency_key, request_hash, status
  ) values (
    p_business_id, v_actor_id, v_command_name, p_idempotency_key, v_request_hash, 'RUNNING'
  )
  on conflict (business_id, command_name, idempotency_key) do nothing
  returning id into v_execution_id;

  if v_execution_id is null then
    select ce.*
    into v_existing
    from talvo.command_executions ce
    where ce.business_id = p_business_id
      and ce.command_name = v_command_name
      and ce.idempotency_key = p_idempotency_key
    for update;

    if v_existing.request_hash is distinct from v_request_hash then
      return talvo.command_error('IDEMPOTENCY_CONFLICT', 'Idempotency key was used for a different request');
    end if;

    if v_existing.status in ('SUCCEEDED', 'FAILED') then
      return v_existing.result_payload;
    end if;

    return talvo.command_error('COMMAND_IN_PROGRESS', 'Command execution is still running');
  end if;

  perform s.id
  from public.shops s
  where s.id = p_business_id
  for update;

  if not found then
    v_result := talvo.command_error('NOT_FOUND', 'Business was not found');
    update talvo.command_executions
    set status = 'FAILED', result_payload = v_result, completed_at = pg_catalog.clock_timestamp()
    where id = v_execution_id;
    return v_result;
  end if;

  select u.*
  into v_unit
  from talvo.units u
  where u.id = p_base_unit_id
  for share;

  perform b.id
  from public.branch b
  where b.shop_id = p_business_id
    and b.is_active
  order by b.id
  for share of b;

  select coalesce(pg_catalog.array_agg(b.id order by b.id), array[]::uuid[])
  into v_branch_ids
  from public.branch b
  where b.shop_id = p_business_id
    and b.is_active;

  if v_normalized_name is null or pg_catalog.length(v_normalized_name) not between 1 and 160 then
    v_result := talvo.command_error('VALIDATION_FAILED', 'Supply item name is required and must not exceed 160 characters');
  elsif v_unit.id is null then
    v_result := talvo.command_error('VALIDATION_FAILED', 'Base unit is not in the allowed unit catalog');
  elsif p_quantity_step is null
        or p_quantity_step <= 0
        or p_quantity_step > 999999999999.999999
        or p_quantity_step <> pg_catalog.trunc(p_quantity_step, v_unit.decimal_scale) then
    v_result := talvo.command_error('VALIDATION_FAILED', 'Quantity step is not exactly representable by the base unit');
  elsif p_is_lot_tracked is null then
    v_result := talvo.command_error('VALIDATION_FAILED', 'is_lot_tracked is required');
  elsif v_expiry_mode is null or v_expiry_mode not in ('REQUIRED_USE_BY', 'NON_EXPIRING') then
    v_result := talvo.command_error('VALIDATION_FAILED', 'Initial expiry mode is invalid');
  elsif not p_is_lot_tracked and v_expiry_mode <> 'NON_EXPIRING' then
    v_result := talvo.command_error('VALIDATION_FAILED', 'Non-lot-tracked supply items must be NON_EXPIRING');
  elsif exists (
    select 1
    from pg_catalog.unnest(v_branch_ids) as active_branch(id)
    where not exists (
      select 1
      from talvo.inventory_locations il
      where il.business_id = p_business_id
        and il.branch_id = active_branch.id
        and il.kind = 'BRANCH_AVAILABLE'
    )
    or not exists (
      select 1
      from talvo.inventory_locations il
      where il.business_id = p_business_id
        and il.branch_id = active_branch.id
        and il.kind = 'BRANCH_QUARANTINE'
    )
  ) then
    v_result := talvo.command_error('INVALID_STATE', 'An active branch is missing canonical inventory locations');
  elsif exists (
    select 1
    from talvo.supply_items si
    where si.business_id = p_business_id
      and si.archived_at is null
      and pg_catalog.lower(si.name) = pg_catalog.lower(v_normalized_name)
  ) then
    v_result := talvo.command_error('VALIDATION_FAILED', 'Supply item name already exists');
  end if;

  if v_result is not null then
    update talvo.command_executions
    set status = 'FAILED', result_payload = v_result, completed_at = pg_catalog.clock_timestamp()
    where id = v_execution_id;
    return v_result;
  end if;

  v_now := pg_catalog.clock_timestamp();

  insert into talvo.supply_items(
    id, business_id, name, base_unit_id, quantity_step, is_lot_tracked,
    revision, created_by, created_at, updated_at
  ) values (
    v_supply_item_id, p_business_id, v_normalized_name, p_base_unit_id,
    p_quantity_step, p_is_lot_tracked, 1, v_actor_id, v_now, v_now
  );

  insert into talvo.ingredient_expiry_policies(
    id, business_id, supply_item_id, revision, created_by, created_at, updated_at
  ) values (
    v_expiry_policy_id, p_business_id, v_supply_item_id, 1, v_actor_id, v_now, v_now
  );

  insert into talvo.ingredient_expiry_policy_versions(
    id, business_id, ingredient_expiry_policy_id, supply_item_id,
    version_number, status, mode, created_by, created_at, activated_at
  ) values (
    v_expiry_policy_version_id, p_business_id, v_expiry_policy_id, v_supply_item_id,
    1, 'ACTIVE', v_expiry_mode, v_actor_id, v_now, v_now
  );

  if not p_is_lot_tracked then
    foreach v_branch_id in array v_branch_ids loop
      select il.id
      into v_available_location_id
      from talvo.inventory_locations il
      where il.business_id = p_business_id
        and il.branch_id = v_branch_id
        and il.kind = 'BRANCH_AVAILABLE'
      for update;

      v_lot_id := extensions.gen_random_uuid();

      insert into talvo.ingredient_lots(
        id, business_id, supply_item_id, expiry_policy_version_id,
        parent_lot_id, root_lot_id, system_branch_id, provenance_source_ref,
        provenance_status, status, created_by, created_at
      ) values (
        v_lot_id, p_business_id, v_supply_item_id, v_expiry_policy_version_id,
        null, v_lot_id, v_branch_id, 'talvo:system-untracked:' || v_branch_id::text,
        'VERIFIED', 'ACTIVE', v_actor_id, v_now
      );

      insert into talvo.inventory_balances(
        business_id, location_id, ingredient_lot_id, quantity_base, version, updated_at
      ) values (
        p_business_id, v_available_location_id, v_lot_id, 0, 1, v_now
      );

      v_lot_count := v_lot_count + 1;
    end loop;
  end if;

  insert into talvo.audit_events(
    business_id, command_execution_id, actor_id, capability,
    aggregate_type, aggregate_id, action, payload, created_at
  ) values (
    p_business_id, v_execution_id, v_actor_id, v_capability,
    'SupplyItem', v_supply_item_id, 'Created',
    pg_catalog.jsonb_build_object(
      'name', v_normalized_name,
      'base_unit_id', p_base_unit_id,
      'quantity_step', p_quantity_step,
      'is_lot_tracked', p_is_lot_tracked,
      'initial_expiry_mode', v_expiry_mode,
      'system_untracked_lot_count', v_lot_count
    ),
    v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'supply_item_id', v_supply_item_id,
      'expiry_policy_id', v_expiry_policy_id,
      'expiry_policy_version_id', v_expiry_policy_version_id,
      'revision', 1,
      'system_untracked_lot_count', v_lot_count
    )
  );

  update talvo.command_executions
  set status = 'SUCCEEDED', result_payload = v_result, completed_at = pg_catalog.clock_timestamp()
  where id = v_execution_id;

  return v_result;
end
$$;

revoke all on function public.create_talvo_supply_item(uuid, text, uuid, numeric, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_talvo_supply_item(uuid, text, uuid, numeric, boolean, text, text)
  to authenticated;

revoke all on all functions in schema talvo from public, anon, authenticated, service_role;
