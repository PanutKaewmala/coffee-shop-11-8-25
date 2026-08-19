-- TALVO backend vertical slice: ReceiveSupplyItem.
-- Contract v3: atomic, idempotent, authorization-safe stock receipt.

insert into talvo.role_capabilities(role, capability)
values ('owner', 'inventory.stock.receive')
on conflict do nothing;

-- Once a policy version has been activated its semantic history is immutable.
-- Lifecycle may only move ACTIVE -> ARCHIVED and set archived_at once.
create function talvo.protect_expiry_policy_version_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.activated_at is not null then
    if new.business_id is distinct from old.business_id
       or new.ingredient_expiry_policy_id is distinct from old.ingredient_expiry_policy_id
       or new.supply_item_id is distinct from old.supply_item_id
       or new.version_number is distinct from old.version_number
       or new.mode is distinct from old.mode
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.activated_at is distinct from old.activated_at then
      raise exception 'TALVO_EXPIRY_POLICY_VERSION_HISTORY_IMMUTABLE' using errcode = '55000';
    end if;

    if old.status = 'ACTIVE' then
      if new.status not in ('ACTIVE', 'ARCHIVED') then
        raise exception 'TALVO_EXPIRY_POLICY_VERSION_INVALID_TRANSITION' using errcode = '55000';
      end if;
      if new.status = 'ACTIVE' and new.archived_at is distinct from old.archived_at then
        raise exception 'TALVO_EXPIRY_POLICY_VERSION_INVALID_TRANSITION' using errcode = '55000';
      end if;
      if new.status = 'ARCHIVED' and new.archived_at is null then
        raise exception 'TALVO_EXPIRY_POLICY_VERSION_INVALID_TRANSITION' using errcode = '55000';
      end if;
    elsif old.status = 'ARCHIVED' and (
      new.status is distinct from old.status or new.archived_at is distinct from old.archived_at
    ) then
      raise exception 'TALVO_EXPIRY_POLICY_VERSION_HISTORY_IMMUTABLE' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;

create trigger talvo_expiry_policy_version_history_guard
before update on talvo.ingredient_expiry_policy_versions
for each row execute function talvo.protect_expiry_policy_version_history();

-- Lot identity/provenance/expiry is historical evidence. Status is deliberately
-- excluded so a later command may implement ACTIVE -> RECALLED.
create function talvo.protect_ingredient_lot_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.business_id is distinct from old.business_id
     or new.supply_item_id is distinct from old.supply_item_id
     or new.expiry_policy_version_id is distinct from old.expiry_policy_version_id
     or new.parent_lot_id is distinct from old.parent_lot_id
     or new.root_lot_id is distinct from old.root_lot_id
     or new.system_branch_id is distinct from old.system_branch_id
     or new.provenance_source_ref is distinct from old.provenance_source_ref
     or new.external_batch_code is distinct from old.external_batch_code
     or new.provenance_status is distinct from old.provenance_status
     or new.manufacturer_use_by_at is distinct from old.manufacturer_use_by_at
     or new.effective_use_by_at is distinct from old.effective_use_by_at
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'TALVO_INGREDIENT_LOT_HISTORY_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger talvo_ingredient_lot_history_guard
before update on talvo.ingredient_lots
for each row execute function talvo.protect_ingredient_lot_history();

create function public.receive_talvo_supply_item(
  p_business_id uuid,
  p_branch_id uuid,
  p_supply_item_id uuid,
  p_quantity_base numeric,
  p_provenance_source_ref text,
  p_external_batch_code text,
  p_manufacturer_use_by_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_capability constant text := 'inventory.stock.receive';
  v_command_name constant text := 'ReceiveSupplyItem';
  v_member_role text;
  v_request_hash text;
  v_execution_id uuid;
  v_existing talvo.command_executions%rowtype;
  v_supply_item talvo.supply_items%rowtype;
  v_unit talvo.units%rowtype;
  v_policy talvo.ingredient_expiry_policies%rowtype;
  v_policy_version talvo.ingredient_expiry_policy_versions%rowtype;
  v_available_location_id uuid;
  v_lot_id uuid;
  v_system_lot talvo.ingredient_lots%rowtype;
  v_balance talvo.inventory_balances%rowtype;
  v_result jsonb;
  v_now timestamptz;
  v_source_ref text := pg_catalog.btrim(p_provenance_source_ref);
  v_batch_code text := nullif(pg_catalog.btrim(p_external_batch_code), '');
  v_max_balance constant numeric := 999999999999.999999;
begin
  if v_actor_id is null then
    return talvo.command_error('FORBIDDEN', 'Current actor is not authenticated');
  end if;

  -- Membership is locked so authorization cannot be revoked halfway through.
  select sm.role into v_member_role
  from public.shop_members sm
  where sm.shop_id = p_business_id and sm.user_id = v_actor_id
  for update of sm;

  if v_member_role is null or not exists (
    select 1 from talvo.role_capabilities rc
    where rc.role = v_member_role and rc.capability = v_capability
  ) then
    return talvo.command_error('FORBIDDEN', 'Current actor lacks inventory.stock.receive');
  end if;

  if p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.length(p_idempotency_key) not between 8 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    return talvo.command_error('VALIDATION_FAILED', 'Idempotency key is invalid');
  end if;

  v_request_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'business_id', p_business_id,
      'actor_id', v_actor_id,
      'branch_id', p_branch_id,
      'supply_item_id', p_supply_item_id,
      'quantity_base', p_quantity_base,
      'provenance_source_ref', v_source_ref,
      'external_batch_code', v_batch_code,
      'manufacturer_use_by_at', p_manufacturer_use_by_at
    )::text, 'UTF8'), 'sha256'), 'hex'
  );

  insert into talvo.command_executions(
    business_id, actor_id, command_name, idempotency_key, request_hash, status
  ) values (p_business_id, v_actor_id, v_command_name, p_idempotency_key, v_request_hash, 'RUNNING')
  on conflict (business_id, command_name, idempotency_key) do nothing
  returning id into v_execution_id;

  if v_execution_id is null then
    select ce.* into v_existing
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

  -- Canonical mutation lock order: Business -> Branch -> SupplyItem -> Policy ->
  -- PolicyVersion -> InventoryLocation -> IngredientLot -> InventoryBalance.
  perform s.id from public.shops s where s.id = p_business_id for update;
  if not found then
    v_result := talvo.command_error('NOT_FOUND', 'Business was not found');
  end if;

  if v_result is null then
    perform b.id from public.branch b
    where b.shop_id = p_business_id and b.id = p_branch_id and b.is_active
    for update;
    if not found then
      v_result := talvo.command_error('NOT_FOUND', 'Active branch was not found');
    end if;
  end if;

  if v_result is null then
    select si.* into v_supply_item
    from talvo.supply_items si
    where si.business_id = p_business_id
      and si.id = p_supply_item_id
      and si.archived_at is null
    for update;
    if v_supply_item.id is null then
      v_result := talvo.command_error('NOT_FOUND', 'Active supply item was not found');
    end if;
  end if;

  if v_result is null then
    select u.* into v_unit from talvo.units u where u.id = v_supply_item.base_unit_id for share;
    if v_unit.id is null then
      v_result := talvo.command_error('INVALID_STATE', 'Supply item base unit is missing');
    elsif p_quantity_base is null or p_quantity_base <= 0
       or p_quantity_base > v_max_balance
       or p_quantity_base <> pg_catalog.trunc(p_quantity_base, v_unit.decimal_scale)
       or pg_catalog.mod(p_quantity_base, v_supply_item.quantity_step) <> 0 then
      v_result := talvo.command_error('VALIDATION_FAILED', 'Quantity is invalid for the supply item');
    end if;
  end if;

  if v_result is null then
    select ep.* into v_policy
    from talvo.ingredient_expiry_policies ep
    where ep.business_id = p_business_id and ep.supply_item_id = p_supply_item_id
    for update;
    if v_policy.id is null then
      v_result := talvo.command_error('INVALID_STATE', 'Expiry policy is missing');
    end if;
  end if;

  if v_result is null then
    select epv.* into v_policy_version
    from talvo.ingredient_expiry_policy_versions epv
    where epv.business_id = p_business_id
      and epv.ingredient_expiry_policy_id = v_policy.id
      and epv.supply_item_id = p_supply_item_id
      and epv.status = 'ACTIVE'
    for update;
    if v_policy_version.id is null then
      v_result := talvo.command_error('INVALID_STATE', 'Active expiry policy version is missing');
    end if;
  end if;

  if v_result is null then
    select il.id into v_available_location_id
    from talvo.inventory_locations il
    where il.business_id = p_business_id
      and il.branch_id = p_branch_id
      and il.kind = 'BRANCH_AVAILABLE'
    for update;
    if v_available_location_id is null then
      v_result := talvo.command_error('INVALID_STATE', 'Branch available inventory location is missing');
    end if;
  end if;

  v_now := pg_catalog.clock_timestamp();

  if v_result is null and v_supply_item.is_lot_tracked then
    if v_source_ref is null or pg_catalog.length(v_source_ref) not between 1 and 512 then
      v_result := talvo.command_error('VALIDATION_FAILED', 'Provenance source reference is required');
    elsif v_batch_code is not null and pg_catalog.length(v_batch_code) > 256 then
      v_result := talvo.command_error('VALIDATION_FAILED', 'External batch code is too long');
    elsif v_policy_version.mode = 'REQUIRED_USE_BY'
          and (p_manufacturer_use_by_at is null or p_manufacturer_use_by_at <= v_now) then
      v_result := talvo.command_error('VALIDATION_FAILED', 'Manufacturer use-by must be in the future');
    elsif v_policy_version.mode = 'NON_EXPIRING' and p_manufacturer_use_by_at is not null then
      v_result := talvo.command_error('VALIDATION_FAILED', 'Non-expiring supply item must not have a use-by timestamp');
    end if;

    if v_result is null then
      v_lot_id := extensions.gen_random_uuid();
      insert into talvo.ingredient_lots(
        id, business_id, supply_item_id, expiry_policy_version_id,
        parent_lot_id, root_lot_id, system_branch_id,
        provenance_source_ref, external_batch_code, provenance_status,
        manufacturer_use_by_at, effective_use_by_at, status, created_by, created_at
      ) values (
        v_lot_id, p_business_id, p_supply_item_id, v_policy_version.id,
        null, v_lot_id, null,
        v_source_ref, v_batch_code, 'VERIFIED',
        case when v_policy_version.mode = 'REQUIRED_USE_BY' then p_manufacturer_use_by_at else null end,
        case when v_policy_version.mode = 'REQUIRED_USE_BY' then p_manufacturer_use_by_at else null end,
        'ACTIVE', v_actor_id, v_now
      );

      insert into talvo.inventory_balances(
        business_id, location_id, ingredient_lot_id, quantity_base, version, updated_at
      ) values (p_business_id, v_available_location_id, v_lot_id, p_quantity_base, 1, v_now);
    end if;
  elsif v_result is null then
    if v_policy_version.mode <> 'NON_EXPIRING' then
      v_result := talvo.command_error('INVALID_STATE', 'Non-lot-tracked supply item must be NON_EXPIRING');
    elsif p_manufacturer_use_by_at is not null or v_batch_code is not null then
      v_result := talvo.command_error('VALIDATION_FAILED', 'Non-lot-tracked receipt must not provide lot expiry or batch data');
    end if;

    if v_result is null then
      select lot.* into v_system_lot
      from talvo.ingredient_lots lot
      where lot.business_id = p_business_id
        and lot.supply_item_id = p_supply_item_id
        and lot.system_branch_id = p_branch_id
      for update;

      if v_system_lot.id is null
         or v_system_lot.parent_lot_id is not null
         or v_system_lot.root_lot_id is distinct from v_system_lot.id
         or v_system_lot.provenance_source_ref is distinct from ('talvo:system-untracked:' || p_branch_id::text)
         or v_system_lot.external_batch_code is not null
         or v_system_lot.provenance_status <> 'VERIFIED'
         or v_system_lot.manufacturer_use_by_at is not null
         or v_system_lot.effective_use_by_at is not null
         or v_system_lot.status <> 'ACTIVE'
         or v_system_lot.expiry_policy_version_id is distinct from v_policy_version.id then
        v_result := talvo.command_error('INVALID_STATE', 'Canonical non-lot system lot is inconsistent');
      end if;
    end if;

    if v_result is null then
      select ib.* into v_balance
      from talvo.inventory_balances ib
      where ib.business_id = p_business_id
        and ib.location_id = v_available_location_id
        and ib.ingredient_lot_id = v_system_lot.id
      for update;

      if v_balance.location_id is null then
        v_result := talvo.command_error('INVALID_STATE', 'Canonical non-lot inventory balance is missing');
      elsif v_balance.quantity_base + p_quantity_base > v_max_balance then
        v_result := talvo.command_error('BALANCE_LIMIT_EXCEEDED', 'Resulting inventory balance exceeds supported range');
      else
        update talvo.inventory_balances
        set quantity_base = quantity_base + p_quantity_base,
            version = version + 1,
            updated_at = v_now
        where business_id = p_business_id
          and location_id = v_available_location_id
          and ingredient_lot_id = v_system_lot.id;
      end if;
    end if;
  end if;

  if v_result is not null then
    update talvo.command_executions
    set status = 'FAILED', result_payload = v_result, completed_at = pg_catalog.clock_timestamp()
    where id = v_execution_id;
    return v_result;
  end if;

  insert into talvo.audit_events(
    business_id, command_execution_id, actor_id, capability,
    aggregate_type, aggregate_id, action, payload, created_at
  ) values (
    p_business_id, v_execution_id, v_actor_id, v_capability,
    'SupplyItem', p_supply_item_id, 'StockReceived',
    pg_catalog.jsonb_build_object(
      'branch_id', p_branch_id,
      'quantity_base', p_quantity_base,
      'ingredient_lot_id', case when v_supply_item.is_lot_tracked then v_lot_id else v_system_lot.id end,
      'expiry_policy_version_id', v_policy_version.id,
      'provenance_source_ref', v_source_ref,
      'external_batch_code', v_batch_code,
      'manufacturer_use_by_at', p_manufacturer_use_by_at
    ), v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'supply_item_id', p_supply_item_id,
      'branch_id', p_branch_id,
      'ingredient_lot_id', case when v_supply_item.is_lot_tracked then v_lot_id else v_system_lot.id end,
      'quantity_received_base', p_quantity_base
    )
  );

  update talvo.command_executions
  set status = 'SUCCEEDED', result_payload = v_result, completed_at = pg_catalog.clock_timestamp()
  where id = v_execution_id;

  return v_result;
end
$$;

revoke all on function public.receive_talvo_supply_item(uuid, uuid, uuid, numeric, text, text, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.receive_talvo_supply_item(uuid, uuid, uuid, numeric, text, text, timestamptz, text)
  to authenticated;

revoke all on function talvo.protect_expiry_policy_version_history() from public, anon, authenticated, service_role;
revoke all on function talvo.protect_ingredient_lot_history() from public, anon, authenticated, service_role;