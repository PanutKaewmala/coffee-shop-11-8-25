\set ON_ERROR_STOP on
\if :{?talvo_business_id}
\else
\echo 'talvo_business_id is required'
\quit
\endif
\if :{?talvo_actor_id}
\else
\echo 'talvo_actor_id is required'
\quit
\endif

select
  :'talvo_business_id'::uuid::text as talvo_business_uuid,
  :'talvo_actor_id'::uuid::text as talvo_actor_uuid
\gset

begin;

select set_config('talvo_test.business_id', :'talvo_business_uuid', false);
select set_config('talvo_test.actor_id', :'talvo_actor_uuid', false);
select set_config('request.jwt.claim.sub', current_setting('talvo_test.actor_id'), false);
set local role authenticated;

do $create_and_replay$
declare
  first_result jsonb;
  replay_result jsonb;
  conflict_result jsonb;
begin
  first_result := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO integration untracked',
    '10000000-0000-4000-8000-000000000001',
    0.001,
    false,
    'NON_EXPIRING',
    'integration-create-untracked-0001'
  );

  if first_result->>'ok' is distinct from 'true' then
    raise exception 'Expected non-lot-tracked creation to succeed: %', first_result;
  end if;
  if (first_result#>>'{data,revision}')::integer <> 1
     or (first_result#>>'{data,system_untracked_lot_count}')::integer <> 2 then
    raise exception 'Unexpected CreateSupplyItem result: %', first_result;
  end if;

  replay_result := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO integration untracked',
    '10000000-0000-4000-8000-000000000001',
    0.001,
    false,
    'NON_EXPIRING',
    'integration-create-untracked-0001'
  );
  if replay_result is distinct from first_result then
    raise exception 'Same-key replay returned a different result';
  end if;

  conflict_result := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO changed request',
    '10000000-0000-4000-8000-000000000001',
    0.001,
    false,
    'NON_EXPIRING',
    'integration-create-untracked-0001'
  );
  if conflict_result#>>'{error,code}' is distinct from 'IDEMPOTENCY_CONFLICT' then
    raise exception 'Different payload reused the key: %', conflict_result;
  end if;

  perform set_config(
    'talvo_test.untracked_item_id',
    first_result#>>'{data,supply_item_id}',
    false
  );
end
$create_and_replay$;

reset role;

do $verify_created_graph$
declare
  item_id uuid := current_setting('talvo_test.untracked_item_id')::uuid;
  v_business_id uuid := current_setting('talvo_test.business_id')::uuid;
begin
  if (
    select count(*)
    from talvo.supply_items si
    where si.id = item_id and si.business_id = v_business_id
  ) <> 1 then
    raise exception 'Supply item was not created exactly once';
  end if;
  if (
    select count(*)
    from talvo.ingredient_expiry_policies ep
    join talvo.ingredient_expiry_policy_versions epv
      on epv.business_id = ep.business_id
     and epv.ingredient_expiry_policy_id = ep.id
     and epv.supply_item_id = ep.supply_item_id
    where ep.business_id = v_business_id
      and ep.supply_item_id = item_id
      and ep.revision = 1
      and epv.version_number = 1
      and epv.status = 'ACTIVE'
      and epv.mode = 'NON_EXPIRING'
  ) <> 1 then
    raise exception 'Expiry policy graph is incomplete';
  end if;
  if (
    select count(*)
    from talvo.ingredient_lots lot
    where lot.business_id = v_business_id
      and lot.supply_item_id = item_id
      and lot.system_branch_id is not null
      and lot.root_lot_id = lot.id
      and lot.provenance_status = 'VERIFIED'
      and lot.manufacturer_use_by_at is null
      and lot.effective_use_by_at is null
  ) <> 2 then
    raise exception 'Expected one verified system lot per active branch';
  end if;
  if (
    select count(*)
    from talvo.inventory_balances ib
    join talvo.ingredient_lots lot
      on lot.business_id = ib.business_id
     and lot.id = ib.ingredient_lot_id
    join talvo.inventory_locations il
      on il.business_id = ib.business_id
     and il.id = ib.location_id
    where lot.business_id = v_business_id
      and lot.supply_item_id = item_id
      and il.kind = 'BRANCH_AVAILABLE'
      and il.branch_id = lot.system_branch_id
      and ib.quantity_base = 0
  ) <> 2 then
    raise exception 'Expected zero available balance for every system lot';
  end if;
  if (
    select count(*)
    from talvo.command_executions ce
    where ce.business_id = v_business_id
      and ce.command_name = 'CreateSupplyItem'
      and ce.idempotency_key = 'integration-create-untracked-0001'
      and ce.status = 'SUCCEEDED'
  ) <> 1 then
    raise exception 'Successful command execution was not recorded exactly once';
  end if;
  if (
    select count(*)
    from talvo.audit_events ae
    where ae.business_id = v_business_id
      and ae.aggregate_id = item_id
      and ae.capability = 'inventory.supply_item.create'
      and ae.action = 'Created'
  ) <> 1 then
    raise exception 'CreateSupplyItem audit event is missing';
  end if;
end
$verify_created_graph$;

set local role authenticated;

do $create_lot_tracked$
declare
  result jsonb;
begin
  result := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO integration lot tracked',
    '10000000-0000-4000-8000-000000000002',
    0.001,
    true,
    'REQUIRED_USE_BY',
    'integration-create-lot-tracked-0002'
  );
  if result->>'ok' is distinct from 'true'
     or (result#>>'{data,system_untracked_lot_count}')::integer <> 0 then
    raise exception 'Lot-tracked creation failed: %', result;
  end if;
  perform set_config('talvo_test.lot_tracked_item_id', result#>>'{data,supply_item_id}', false);
end
$create_lot_tracked$;

reset role;

do $verify_lot_tracked$
declare
  item_id uuid := current_setting('talvo_test.lot_tracked_item_id')::uuid;
begin
  if exists(select 1 from talvo.ingredient_lots where supply_item_id = item_id) then
    raise exception 'Lot-tracked item unexpectedly received a system lot';
  end if;
  if not exists (
    select 1
    from talvo.ingredient_expiry_policy_versions
    where supply_item_id = item_id and status = 'ACTIVE' and mode = 'REQUIRED_USE_BY'
  ) then
    raise exception 'Lot-tracked item is missing its REQUIRED_USE_BY policy';
  end if;
end
$verify_lot_tracked$;

set local role authenticated;

do $deterministic_failures$
declare
  invalid_mode jsonb;
  invalid_mode_replay jsonb;
  invalid_step jsonb;
  invalid_unit jsonb;
  duplicate_name jsonb;
begin
  invalid_mode := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO invalid expiry mode',
    '10000000-0000-4000-8000-000000000001',
    0.001,
    false,
    'REQUIRED_USE_BY',
    'integration-invalid-mode-0003'
  );
  if invalid_mode#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then
    raise exception 'Non-lot REQUIRED_USE_BY was not rejected: %', invalid_mode;
  end if;
  invalid_mode_replay := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO invalid expiry mode',
    '10000000-0000-4000-8000-000000000001',
    0.001,
    false,
    'REQUIRED_USE_BY',
    'integration-invalid-mode-0003'
  );
  if invalid_mode_replay is distinct from invalid_mode then
    raise exception 'Failed command did not replay its stable result';
  end if;

  invalid_step := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO invalid piece step',
    '10000000-0000-4000-8000-000000000003',
    0.5,
    true,
    'NON_EXPIRING',
    'integration-invalid-step-0004'
  );
  if invalid_step#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then
    raise exception 'Unrepresentable quantity step was not rejected: %', invalid_step;
  end if;

  invalid_unit := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO invalid unit',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    1,
    true,
    'NON_EXPIRING',
    'integration-invalid-unit-0005'
  );
  if invalid_unit#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then
    raise exception 'Unit outside the catalog was not rejected: %', invalid_unit;
  end if;

  duplicate_name := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'talvo INTEGRATION untracked',
    '10000000-0000-4000-8000-000000000001',
    0.001,
    false,
    'NON_EXPIRING',
    'integration-duplicate-name-0006'
  );
  if duplicate_name#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then
    raise exception 'Case-insensitive duplicate name was not rejected: %', duplicate_name;
  end if;
end
$deterministic_failures$;

reset role;

do $verify_atomic_failures$
declare
  v_business_id uuid := current_setting('talvo_test.business_id')::uuid;
begin
  if exists (
    select 1 from talvo.supply_items si
    where si.business_id = v_business_id
      and si.name in ('TALVO invalid expiry mode', 'TALVO invalid piece step', 'TALVO invalid unit')
  ) then
    raise exception 'A rejected command left a partial supply item';
  end if;
  if (
    select count(*)
    from talvo.command_executions ce
    where ce.business_id = v_business_id
      and ce.idempotency_key in (
        'integration-invalid-mode-0003',
        'integration-invalid-step-0004',
        'integration-invalid-unit-0005',
        'integration-duplicate-name-0006'
      )
      and ce.status = 'FAILED'
  ) <> 4 then
    raise exception 'Deterministic failures were not persisted';
  end if;
end
$verify_atomic_failures$;

select set_config('request.jwt.claim.sub', '34000000-0000-4000-8000-000000000005', false);
set local role authenticated;

do $cross_actor_replay$
declare
  result jsonb;
begin
  result := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO integration untracked',
    '10000000-0000-4000-8000-000000000001',
    0.001,
    false,
    'NON_EXPIRING',
    'integration-create-untracked-0001'
  );
  if result#>>'{error,code}' is distinct from 'IDEMPOTENCY_CONFLICT' then
    raise exception 'Cross-actor key replay was not rejected: %', result;
  end if;
end
$cross_actor_replay$;

reset role;

select set_config('request.jwt.claim.sub', current_setting('talvo_test.actor_id'), false);
set local role authenticated;

do $tenant_isolation$
declare
  result jsonb;
begin
  result := public.create_talvo_supply_item(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'TALVO cross tenant attempt',
    '10000000-0000-4000-8000-000000000001',
    0.001,
    false,
    'NON_EXPIRING',
    'integration-cross-tenant-0007'
  );
  if result#>>'{error,code}' is distinct from 'FORBIDDEN' then
    raise exception 'Cross-tenant command was not rejected: %', result;
  end if;
end
$tenant_isolation$;

reset role;

update public.shop_members
set role = 'staff'
where shop_id = current_setting('talvo_test.business_id')::uuid
  and user_id = current_setting('talvo_test.actor_id')::uuid;

select set_config('request.jwt.claim.sub', current_setting('talvo_test.actor_id'), false);
set local role authenticated;

do $current_authorization$
declare
  result jsonb;
begin
  result := public.create_talvo_supply_item(
    current_setting('talvo_test.business_id')::uuid,
    'TALVO forbidden create',
    '10000000-0000-4000-8000-000000000001',
    0.001,
    false,
    'NON_EXPIRING',
    'integration-forbidden-owner-0008'
  );
  if result#>>'{error,code}' is distinct from 'FORBIDDEN' then
    raise exception 'Current capability was not rechecked: %', result;
  end if;
end
$current_authorization$;

reset role;

update public.shop_members
set role = 'owner'
where shop_id = current_setting('talvo_test.business_id')::uuid
  and user_id = current_setting('talvo_test.actor_id')::uuid;

do $security_surface$
begin
  if has_schema_privilege('anon', 'talvo', 'USAGE')
     or has_schema_privilege('authenticated', 'talvo', 'USAGE')
     or has_schema_privilege('service_role', 'talvo', 'USAGE') then
    raise exception 'Direct TALVO schema access is exposed';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.create_talvo_supply_item(uuid,text,uuid,numeric,boolean,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated actor cannot execute CreateSupplyItem';
  end if;
  if has_function_privilege(
    'anon',
    'public.create_talvo_supply_item(uuid,text,uuid,numeric,boolean,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.create_talvo_supply_item(uuid,text,uuid,numeric,boolean,text,text)',
    'EXECUTE'
  ) then
    raise exception 'CreateSupplyItem RPC ACL is too broad';
  end if;
end
$security_surface$;

rollback;

\echo 'TALVO CreateSupplyItem integration contract passed (transaction rolled back)'
