-- One checkout transaction, using the existing recipe model and inventory stores.
-- Historical rows are not reconstructed from today's recipes.
alter table public.recipe_items
  alter column ingredient_id drop not null,
  add column supply_item_id uuid,
  add column branch_id uuid;

update public.recipe_items r set branch_id = i.branch_id
from public.ingredients i where i.id = r.ingredient_id and i.shop_id = r.shop_id;
-- Leave invalid legacy data visible and fail closed at checkout; do not guess a branch.
alter table public.recipe_items
  add constraint recipe_items_source_check check (num_nonnulls(ingredient_id, supply_item_id) = 1),
  add constraint recipe_items_branch_fk foreign key (shop_id, branch_id) references public.branch(shop_id, id),
  add constraint recipe_items_supply_fk foreign key (shop_id, supply_item_id) references talvo.supply_items(business_id, id);
create index recipe_items_branch_variant_idx on public.recipe_items(shop_id, branch_id, variant_id);
create unique index recipe_items_supply_uidx on public.recipe_items(shop_id, branch_id, variant_id, supply_item_id)
  where supply_item_id is not null;

alter table public.orders add column inventory_snapshot jsonb;
alter table public.order_items add column recipe_snapshot jsonb;

-- The database is the authority even for callers that bypass the Next.js route.
create function talvo.validate_sale_recipe_item() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_unit record;
begin
  if new.branch_id is null or not exists (
    select 1 from public.branch b where b.id = new.branch_id and b.shop_id = new.shop_id
  ) or not exists (
    select 1 from public.menu_variants v where v.id = new.variant_id and v.shop_id = new.shop_id
  ) then raise exception 'INVALID_RECIPE_SCOPE' using errcode = '22023'; end if;
  if new.quantity is null or new.quantity <= 0 or new.quantity::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'INVALID_RECIPE_QUANTITY' using errcode = '22023';
  end if;
  if new.ingredient_id is not null then
    if not exists (select 1 from public.ingredients i where i.id = new.ingredient_id
      and i.shop_id = new.shop_id and i.branch_id = new.branch_id and i.is_active and i.archived_at is null) then
      raise exception 'RECIPE_INGREDIENT_OUTSIDE_BRANCH' using errcode = '22023';
    end if;
  else
    select u.decimal_scale, s.quantity_step into v_unit from talvo.supply_items s
    join talvo.units u on u.id = s.base_unit_id
    where s.business_id = new.shop_id and s.id = new.supply_item_id and s.archived_at is null;
    if not found then raise exception 'INVALID_RECIPE_SUPPLY_ITEM' using errcode = '22023'; end if;
    if new.quantity <> trunc(new.quantity, v_unit.decimal_scale)
      or mod(new.quantity, v_unit.quantity_step) <> 0 or new.quantity > 999999999999.999999 then
      raise exception 'INVALID_RECIPE_QUANTITY' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger recipe_items_validate_source before insert or update on public.recipe_items
for each row execute function talvo.validate_sale_recipe_item();
revoke all on function talvo.validate_sale_recipe_item() from public, anon, authenticated, service_role;

create function talvo.protect_sale_snapshot() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if tg_table_name = 'orders' then
    if old.inventory_snapshot is null then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    if tg_op = 'DELETE' then raise exception 'SALE_HISTORY_IMMUTABLE' using errcode = '55000'; end if;
    if (to_jsonb(new) - array['status','note','cancel_reason','cancel_note','cancelled_at','cancelled_by','stock_refunded','stock_refunded_at'])
       is distinct from
       (to_jsonb(old) - array['status','note','cancel_reason','cancel_note','cancelled_at','cancelled_by','stock_refunded','stock_refunded_at']) then
      raise exception 'SALE_HISTORY_IMMUTABLE' using errcode = '55000';
    end if;
  elsif tg_table_name = 'order_items' then
    if old.recipe_snapshot is not null then
      raise exception 'SALE_HISTORY_IMMUTABLE' using errcode = '55000';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger orders_sale_history_guard before update or delete on public.orders
for each row execute function talvo.protect_sale_snapshot();
create trigger order_items_sale_history_guard before update or delete on public.order_items
for each row execute function talvo.protect_sale_snapshot();
revoke all on function talvo.protect_sale_snapshot() from public, anon, authenticated, service_role;

create function public.list_talvo_supply_items(p_business_id uuid, p_branch_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if auth.uid() is null or not exists (select 1 from public.shop_members sm
    where sm.shop_id = p_business_id and sm.user_id = auth.uid() and sm.role in ('owner','staff')) then
    raise exception 'OWNER_OR_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if not exists(select 1 from public.branch b where b.shop_id=p_business_id and b.id=p_branch_id) then
    raise exception 'INVALID_BRANCH' using errcode='22023';
  end if;
  return (select coalesce(jsonb_agg(x.item order by x.name, x.id), '[]'::jsonb) from (
    select s.id, s.name, jsonb_build_object('id',s.id,'name',s.name,'base_unit',u.symbol,
      'quantity_step',s.quantity_step,'is_lot_tracked',s.is_lot_tracked,
      'available_stock',coalesce((select sum(b.quantity_base) from talvo.inventory_balances b
        join talvo.inventory_locations loc on loc.id=b.location_id and loc.business_id=b.business_id
        join talvo.ingredient_lots lot on lot.id=b.ingredient_lot_id and lot.business_id=b.business_id
        where b.business_id=p_business_id and loc.branch_id=p_branch_id and loc.kind='BRANCH_AVAILABLE'
          and lot.supply_item_id=s.id and lot.status='ACTIVE' and lot.provenance_status='VERIFIED'
          and (lot.system_branch_id is null or lot.system_branch_id=p_branch_id)
          and (lot.effective_use_by_at is null or lot.effective_use_by_at > statement_timestamp())),0)) item
    from talvo.supply_items s join talvo.units u on u.id=s.base_unit_id
    where s.business_id=p_business_id and s.archived_at is null
  ) x);
end $$;
revoke all on function public.list_talvo_supply_items(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_talvo_supply_items(uuid,uuid) to authenticated;

create or replace function public.process_pos_checkout_atomic(
  p_shop_id uuid, p_branch_id uuid, p_items jsonb,
  p_payment_method text, p_paid_amount numeric, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_business_date date := (now() at time zone 'Asia/Bangkok')::date;
  v_hash text; v_existing_hash text; v_response jsonb;
  v_order_id uuid := extensions.gen_random_uuid(); v_now timestamptz := statement_timestamp();
  v_branch_name text; v_total numeric; v_paid numeric; v_change numeric;
  v_available_id uuid; v_consumed_id uuid; v_need numeric; v_take numeric;
  v_recipe record; v_d record; v_lot record; v_snapshot jsonb;
begin
  -- NOT EXISTS is deliberate: a missing membership must not pass through SQL NULL logic.
  if v_actor is null or not exists(select 1 from public.shop_members sm
    where sm.shop_id=p_shop_id and sm.user_id=v_actor and sm.role in ('owner','staff')) then
    raise exception 'OWNER_OR_STAFF_REQUIRED' using errcode='42501';
  end if;
  select b.name into v_branch_name from public.branch b where b.shop_id=p_shop_id and b.id=p_branch_id;
  if not found then raise exception 'INVALID_BRANCH' using errcode='22023'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200
    or p_idempotency_key <> btrim(p_idempotency_key) then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode='22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'shop_id',p_shop_id,'branch_id',p_branch_id,'items',p_items,
    'payment_method',p_payment_method,'paid_amount',p_paid_amount)::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('pos-idempotency:'||p_shop_id::text||':'||p_idempotency_key,0));
  select request_hash,response into v_existing_hash,v_response from public.pos_idempotency
  where shop_id=p_shop_id and key=p_idempotency_key;
  if found then
    if v_existing_hash is distinct from v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' using errcode='P0001';
    end if;
    return v_response;
  end if;

  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'INVALID_ITEMS' using errcode='22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'INVALID_ITEMS' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x(line) where
    jsonb_typeof(line)<>'object' or jsonb_typeof(line->'qty') is distinct from 'number'
    or coalesce(line->>'variant_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or coalesce(line->>'sweetness','') not in ('0%','25%','50%','75%','100%','125%')) then
    raise exception 'INVALID_VARIANT_SWEETNESS_OR_QUANTITY' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x(line) where
    (line->>'qty')::numeric <= 0 or (line->>'qty')::numeric > 1000000
    or (line->>'qty')::numeric <> trunc((line->>'qty')::numeric)) then
    raise exception 'INVALID_VARIANT_SWEETNESS_OR_QUANTITY' using errcode='22023';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash','promptpay')
    or (p_paid_amount is not null and (p_paid_amount::text in ('NaN','Infinity','-Infinity') or p_paid_amount<0)) then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode='22023';
  end if;

  perform public.assert_business_day_open(p_shop_id,p_branch_id,v_business_date);
  -- Same Business -> Branch -> SupplyItem -> Location -> Lot -> Balance order as ReceiveSupplyItem.
  perform s.id from public.shops s where s.id=p_shop_id for update;
  perform b.id from public.branch b where b.shop_id=p_shop_id and b.id=p_branch_id for update;
  -- No caller-owned temp objects are reused by this definer function.
  drop table if exists pg_temp.sale_lines, pg_temp.sale_recipe, pg_temp.sale_deductions, pg_temp.sale_allocations;
  create temporary table sale_lines(
    id uuid primary key default extensions.gen_random_uuid(), variant_id uuid, sweetness text, qty integer,
    menu_id uuid, item_name text, unit_price numeric, variant_label text, recipe_snapshot jsonb,
    unique(variant_id,sweetness)
  ) on commit drop;
  insert into pg_temp.sale_lines(variant_id,sweetness,qty,menu_id,item_name,unit_price,variant_label)
  select (line->>'variant_id')::uuid,line->>'sweetness',sum((line->>'qty')::numeric)::integer,
    m.id,m.name,coalesce(mv.price_override,m.price),
    concat_ws(' / ',nullif(concat_ws(' ',mst.name,nullif(mv.size,'default')),''),'หวาน '||(line->>'sweetness'))
  from jsonb_array_elements(p_items) x(line)
  join public.menu_variants mv on mv.id=(line->>'variant_id')::uuid and mv.shop_id=p_shop_id
  join public.menu m on m.id=mv.menu_id and m.shop_id=p_shop_id
  left join public.menu_serve_types mst on mst.id=mv.serve_type_id and mst.shop_id=p_shop_id
  group by (line->>'variant_id')::uuid,line->>'sweetness',m.id,m.name,mv.price_override,m.price,mst.name,mv.size;
  if (select coalesce(sum(qty),0) from pg_temp.sale_lines) <>
     (select sum((line->>'qty')::numeric) from jsonb_array_elements(p_items) x(line)) then
    raise exception 'INVALID_VARIANT_SWEETNESS_OR_QUANTITY' using errcode='22023';
  end if;
  if exists(select 1 from pg_temp.sale_lines l join public.branch_menu_availability a
    on a.menu_id=l.menu_id and a.shop_id=p_shop_id and a.branch_id=p_branch_id where not a.is_enabled) then
    raise exception 'MENU_UNAVAILABLE' using errcode='P0001';
  end if;

  -- Capture the recipe exactly once. Later edits cannot change the quantities deducted or saved.
  create temporary table sale_recipe on commit drop as
  select r.id recipe_item_id,r.variant_id,r.ingredient_id,r.supply_item_id,r.quantity quantity_per_item,
    coalesce(i.name,s.name) name,coalesce(i.base_unit,u.symbol) unit,
    coalesce(i.is_active and i.archived_at is null,s.archived_at is null and s.id is not null,false) active,
    i.shop_id ingredient_shop_id,i.branch_id ingredient_branch_id,
    s.business_id supply_business_id,s.quantity_step,u.decimal_scale
  from public.recipe_items r
  left join public.ingredients i on i.id=r.ingredient_id
  left join talvo.supply_items s on s.id=r.supply_item_id
  left join talvo.units u on u.id=s.base_unit_id
  where r.shop_id=p_shop_id and (r.branch_id=p_branch_id or r.branch_id is null)
    and r.variant_id in(select variant_id from pg_temp.sale_lines);
  if exists(select 1 from pg_temp.sale_lines l where not exists(
    select 1 from pg_temp.sale_recipe r where r.variant_id=l.variant_id)) then
    raise exception 'NO_RECIPE' using errcode='P0001';
  end if;
  if exists(select 1 from pg_temp.sale_recipe r where r.quantity_per_item is null or r.quantity_per_item<=0
    or r.quantity_per_item::text in ('NaN','Infinity','-Infinity') or not r.active
    or r.name is null or r.unit is null
    or (r.supply_item_id is not null and (r.quantity_per_item<>trunc(r.quantity_per_item,r.decimal_scale)
      or mod(r.quantity_per_item,r.quantity_step)<>0))) then
    raise exception 'INVALID_RECIPE_QUANTITY' using errcode='P0001';
  end if;
  if exists(select 1 from pg_temp.sale_recipe r where
    (r.ingredient_id is not null and (r.ingredient_shop_id is distinct from p_shop_id or r.ingredient_branch_id is distinct from p_branch_id))
    or (r.supply_item_id is not null and r.supply_business_id is distinct from p_shop_id)) then
    raise exception 'RECIPE_INGREDIENT_OUTSIDE_BRANCH' using errcode='P0001';
  end if;
  create temporary table sale_deductions(
    source_id uuid primary key,ingredient_id uuid,supply_item_id uuid,name text,unit text,
    required_qty numeric,before_stock numeric,after_stock numeric
  ) on commit drop;
  insert into pg_temp.sale_deductions(source_id,ingredient_id,supply_item_id,name,unit,required_qty)
  select coalesce(r.ingredient_id,r.supply_item_id),r.ingredient_id,r.supply_item_id,r.name,r.unit,
    sum(r.quantity_per_item*l.qty) from pg_temp.sale_recipe r
  join pg_temp.sale_lines l on l.variant_id=r.variant_id
  group by r.ingredient_id,r.supply_item_id,r.name,r.unit;
  create temporary table sale_allocations(
    supply_item_id uuid,location_id uuid,ingredient_lot_id uuid,quantity numeric,before_stock numeric,after_stock numeric,
    primary key(location_id,ingredient_lot_id)
  ) on commit drop;

  perform s.id from talvo.supply_items s join pg_temp.sale_deductions d on d.supply_item_id=s.id
  where s.business_id=p_shop_id order by s.id for update of s;
  if exists(select 1 from pg_temp.sale_deductions d join talvo.supply_items s on s.id=d.supply_item_id where s.archived_at is not null) then
    raise exception 'INVALID_RECIPE_SUPPLY_ITEM' using errcode='P0001';
  end if;
  if exists(select 1 from pg_temp.sale_deductions where supply_item_id is not null) then
    if not exists(select 1 from public.branch where id=p_branch_id and shop_id=p_shop_id and is_active) then
      raise exception 'INACTIVE_INVENTORY_BRANCH' using errcode='P0001';
    end if;
    perform loc.id from talvo.inventory_locations loc where loc.business_id=p_shop_id
      and ((loc.branch_id=p_branch_id and loc.kind='BRANCH_AVAILABLE') or loc.kind='CONSUMED')
      order by loc.id for update;
    select id into v_available_id from talvo.inventory_locations where business_id=p_shop_id and branch_id=p_branch_id and kind='BRANCH_AVAILABLE';
    select id into v_consumed_id from talvo.inventory_locations where business_id=p_shop_id and kind='CONSUMED';
    if v_available_id is null then raise exception 'INVENTORY_LOCATION_MISSING' using errcode='P0001'; end if;
    if v_consumed_id is null then
      insert into talvo.inventory_locations(business_id,kind) values(p_shop_id,'CONSUMED') returning id into v_consumed_id;
    end if;
    perform lot.id from talvo.ingredient_lots lot join pg_temp.sale_deductions d on d.supply_item_id=lot.supply_item_id
      where lot.business_id=p_shop_id order by lot.id for update of lot;
    perform b.ingredient_lot_id from talvo.inventory_balances b
      join talvo.ingredient_lots lot on lot.id=b.ingredient_lot_id and lot.business_id=b.business_id
      join pg_temp.sale_deductions d on d.supply_item_id=lot.supply_item_id
      where b.business_id=p_shop_id and b.location_id in(v_available_id,v_consumed_id)
      order by b.location_id,b.ingredient_lot_id for update of b;
  end if;
  perform i.id from public.ingredients i join pg_temp.sale_deductions d on d.ingredient_id=i.id
  where i.shop_id=p_shop_id and i.branch_id=p_branch_id order by i.id for update of i;
  update pg_temp.sale_deductions d set before_stock=i.stock from public.ingredients i
  where i.id=d.ingredient_id and i.shop_id=p_shop_id and i.branch_id=p_branch_id and i.is_active and i.archived_at is null;
  for v_d in select * from pg_temp.sale_deductions where supply_item_id is not null order by source_id loop
    select coalesce(sum(b.quantity_base),0) into v_need from talvo.inventory_balances b
    join talvo.ingredient_lots lot on lot.id=b.ingredient_lot_id and lot.business_id=b.business_id
    where b.business_id=p_shop_id and b.location_id=v_available_id and lot.supply_item_id=v_d.supply_item_id
      and lot.status='ACTIVE' and lot.provenance_status='VERIFIED'
      and (lot.system_branch_id is null or lot.system_branch_id=p_branch_id)
      and (lot.effective_use_by_at is null or lot.effective_use_by_at>v_now);
    update pg_temp.sale_deductions set before_stock=v_need where source_id=v_d.source_id;
    v_need := v_d.required_qty;
    -- Deterministic receipt order (created_at, id). Expiry is eligibility, never FEFO priority.
    for v_lot in select b.*,lot.created_at from talvo.inventory_balances b
      join talvo.ingredient_lots lot on lot.id=b.ingredient_lot_id and lot.business_id=b.business_id
      where b.business_id=p_shop_id and b.location_id=v_available_id and lot.supply_item_id=v_d.supply_item_id
        and b.quantity_base>0 and lot.status='ACTIVE' and lot.provenance_status='VERIFIED'
        and (lot.system_branch_id is null or lot.system_branch_id=p_branch_id)
        and (lot.effective_use_by_at is null or lot.effective_use_by_at>v_now)
      order by lot.created_at,lot.id loop
      exit when v_need<=0;
      v_take := least(v_need,v_lot.quantity_base);
      insert into pg_temp.sale_allocations values(v_d.supply_item_id,v_available_id,v_lot.ingredient_lot_id,
        v_take,v_lot.quantity_base,v_lot.quantity_base-v_take);
      v_need := v_need-v_take;
    end loop;
  end loop;
  if exists(select 1 from pg_temp.sale_deductions where before_stock is null or before_stock::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'INGREDIENT_NOT_FOUND_FOR_BRANCH' using errcode='P0001';
  end if;
  if exists(select 1 from pg_temp.sale_deductions where before_stock<required_qty) then
    raise exception 'NOT_ENOUGH_STOCK' using errcode='P0001';
  end if;
  update pg_temp.sale_deductions set after_stock=before_stock-required_qty
  where source_id is not null;
  if exists(select 1 from pg_temp.sale_lines where unit_price<0 or unit_price::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'INVALID_MENU_PRICE' using errcode='22023';
  end if;
  select sum(unit_price*qty) into v_total from pg_temp.sale_lines;
  if p_payment_method='cash' and (p_paid_amount is null or p_paid_amount<v_total) then
    raise exception 'INSUFFICIENT_PAYMENT' using errcode='22023';
  end if;
  v_paid := case when p_payment_method='promptpay' then v_total else p_paid_amount end;
  v_change := v_paid-v_total;

  for v_recipe in select * from pg_temp.sale_lines loop
    select jsonb_build_object('variant_id',v_recipe.variant_id,'branch_id',p_branch_id,'sweetness',v_recipe.sweetness,
      'recipe_hash',encode(extensions.digest(convert_to(jsonb_agg(jsonb_build_object(
        'recipe_item_id',r.recipe_item_id,'ingredient_id',r.ingredient_id,'supply_item_id',r.supply_item_id,
        'quantity_per_item',r.quantity_per_item,'unit',r.unit) order by r.recipe_item_id)::text,'UTF8'),'sha256'),'hex'),
      'ingredients',jsonb_agg(jsonb_build_object('recipe_item_id',r.recipe_item_id,
        'ingredient_id',r.ingredient_id,'supply_item_id',r.supply_item_id,'name',r.name,'unit',r.unit,
        'quantity_per_item',r.quantity_per_item,'quantity',r.quantity_per_item*v_recipe.qty) order by r.recipe_item_id))
    into v_snapshot from pg_temp.sale_recipe r where r.variant_id=v_recipe.variant_id;
    update pg_temp.sale_lines set recipe_snapshot=v_snapshot where id=v_recipe.id;
  end loop;
  select jsonb_build_object('version',1,'actor_id',v_actor,'branch_id',p_branch_id,'branch_name',v_branch_name,
    'ingredients',jsonb_agg(jsonb_build_object('ingredient_id',d.ingredient_id,'supply_item_id',d.supply_item_id,
      'name',d.name,'unit',d.unit,'quantity',d.required_qty,'before_stock',d.before_stock,'after_stock',d.after_stock,
      'allocations',coalesce((select jsonb_agg(jsonb_build_object('location_id',a.location_id,
        'ingredient_lot_id',a.ingredient_lot_id,'quantity',a.quantity,'before_stock',a.before_stock,'after_stock',a.after_stock)
        order by a.ingredient_lot_id) from pg_temp.sale_allocations a where a.supply_item_id=d.supply_item_id),'[]'::jsonb))
      order by d.source_id)) into v_snapshot from pg_temp.sale_deductions d;

  insert into public.orders(id,shop_id,branch_id,total,status,payment_method,paid_amount,change_amount,created_at,paid_at,inventory_snapshot)
  values(v_order_id,p_shop_id,p_branch_id,v_total,'paid',p_payment_method,v_paid,v_change,v_now,v_now,v_snapshot);
  insert into public.order_items(id,order_id,menu_id,variant_id,variant_label,name,price,qty,shop_id,recipe_snapshot)
  select id,v_order_id,menu_id,variant_id,variant_label,item_name,unit_price,qty,p_shop_id,recipe_snapshot
  from pg_temp.sale_lines order by variant_id,sweetness;
  for v_d in select * from pg_temp.sale_deductions where ingredient_id is not null order by source_id loop
    update public.ingredients set stock=v_d.after_stock,updated_at=v_now
    where id=v_d.ingredient_id and shop_id=p_shop_id and branch_id=p_branch_id;
    insert into public.stock_logs(ingredient_id,order_id,amount,type,note,before_stock,after_stock,shop_id,branch_id)
    values(v_d.ingredient_id,v_order_id,v_d.required_qty,'deduct','POS sale',v_d.before_stock,v_d.after_stock,p_shop_id,p_branch_id);
  end loop;
  for v_lot in select * from pg_temp.sale_allocations order by location_id,ingredient_lot_id loop
    update talvo.inventory_balances set quantity_base=quantity_base-v_lot.quantity,version=version+1,updated_at=v_now
    where business_id=p_shop_id and location_id=v_lot.location_id and ingredient_lot_id=v_lot.ingredient_lot_id;
    insert into talvo.inventory_balances(business_id,location_id,ingredient_lot_id,quantity_base,version,updated_at)
    values(p_shop_id,v_consumed_id,v_lot.ingredient_lot_id,v_lot.quantity,1,v_now)
    on conflict(location_id,ingredient_lot_id) do update set quantity_base=talvo.inventory_balances.quantity_base+excluded.quantity_base,
      version=talvo.inventory_balances.version+1,updated_at=excluded.updated_at;
  end loop;
  v_response := jsonb_build_object('success',true,'order',jsonb_build_object(
    'id',v_order_id,'total',v_total,'created_at',v_now,'status','paid','payment_method',p_payment_method,'paid_at',v_now,
    'paid_amount',v_paid,'change_amount',v_change,'note',null,'shop_id',p_shop_id,'branch_id',p_branch_id,'inventory_snapshot',v_snapshot,
    'items',(select jsonb_agg(jsonb_build_object('id',id,'menu_id',menu_id,'variant_id',variant_id,'variant_label',variant_label,
      'name',item_name,'price',unit_price,'qty',qty,'recipe_snapshot',recipe_snapshot) order by variant_id,sweetness) from pg_temp.sale_lines)),
    'deducted',(select jsonb_agg(jsonb_build_object('ingredient_id',ingredient_id,'supply_item_id',supply_item_id,'deduct',required_qty,
      'before_stock',before_stock,'after_stock',after_stock) order by source_id) from pg_temp.sale_deductions));
  insert into public.pos_idempotency(key,shop_id,request_hash,response) values(p_idempotency_key,p_shop_id,v_hash,v_response);
  return v_response;
end $$;
revoke all on function public.process_pos_checkout_atomic(uuid,uuid,jsonb,text,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.process_pos_checkout_atomic(uuid,uuid,jsonb,text,numeric,text) to authenticated;

-- Disable bypasses. POS writes now have exactly one public entry point.
revoke all on function public.process_pos_checkout(jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.deduct_stock_atomic(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.increment_stock(uuid,numeric) from public,anon,authenticated,service_role;
revoke insert,update,delete,truncate,references,trigger on public.orders,public.order_items from anon,authenticated;
revoke all on public.pos_idempotency from anon,authenticated,service_role;

-- Preserve cancellation's existing product choices, restoring exactly the recorded sale use.
-- Old sales without snapshots retain their existing helper; no invented historical recipe.
create or replace function public.cancel_order(p_order_id uuid,p_reason text,p_note text,p_cancelled_by text,p_restock boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_role text; v_order public.orders; v_date date;
  v_d jsonb; v_a jsonb; v_before numeric; v_consumed uuid; v_quantity numeric; v_result jsonb;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0001'; end if;
  select role into v_role from public.shop_members where shop_id=v_order.shop_id and user_id=v_actor;
  if v_actor is null or v_role is null or v_role not in ('owner','staff') then
    raise exception 'OWNER_OR_STAFF_REQUIRED' using errcode='42501';
  end if;
  v_date:=(coalesce(v_order.paid_at,v_order.created_at) at time zone 'Asia/Bangkok')::date;
  perform public.assert_business_day_open(v_order.shop_id,v_order.branch_id,v_date);
  perform id from public.shops where id=v_order.shop_id for update;
  perform id from public.branch where shop_id=v_order.shop_id and id=v_order.branch_id for update;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.inventory_snapshot is null then
    select public.cancel_order_without_business_day_guard(p_order_id,p_reason,p_note,v_role,p_restock) into v_result;
    return v_result;
  end if;
  if v_order.status='cancelled' then return jsonb_build_object('success',true,'order_id',p_order_id,
    'status','cancelled','already_cancelled',true,'stock_refunded',v_order.stock_refunded); end if;
  if v_order.status<>'paid' then return jsonb_build_object('success',false,'error','order_not_paid'); end if;
  if p_restock is null or p_reason is null or p_reason not in ('ลูกค้ายกเลิก','กดผิด / ชงผิด','วัตถุดิบไม่พอ','ระบบขัดข้อง','อื่นๆ') then
    return jsonb_build_object('success',false,'error','invalid_reason');
  end if;
  if p_reason='อื่นๆ' and nullif(btrim(p_note),'') is null then
    return jsonb_build_object('success',false,'error','note_required_for_other');
  end if;
  if p_restock and not v_order.stock_refunded then
    select id into v_consumed from talvo.inventory_locations where business_id=v_order.shop_id and kind='CONSUMED';
    -- Business lock serializes canonical receive/sale/cancel operations; legacy rows lock by UUID.
    perform i.id from public.ingredients i where i.shop_id=v_order.shop_id and i.branch_id=v_order.branch_id
      and i.id in(select (x->>'ingredient_id')::uuid from jsonb_array_elements(v_order.inventory_snapshot->'ingredients') x)
      order by i.id for update;
    for v_d in select x from jsonb_array_elements(v_order.inventory_snapshot->'ingredients') x loop
      v_quantity:=(v_d->>'quantity')::numeric;
      if v_d->>'ingredient_id' is not null then
        select stock into v_before from public.ingredients where id=(v_d->>'ingredient_id')::uuid
          and shop_id=v_order.shop_id and branch_id=v_order.branch_id;
        if not found then raise exception 'INGREDIENT_NOT_FOUND_FOR_BRANCH' using errcode='P0001'; end if;
        update public.ingredients set stock=stock+v_quantity,updated_at=clock_timestamp()
        where id=(v_d->>'ingredient_id')::uuid and shop_id=v_order.shop_id and branch_id=v_order.branch_id;
        insert into public.stock_logs(ingredient_id,order_id,amount,type,note,before_stock,after_stock,shop_id,branch_id)
        values((v_d->>'ingredient_id')::uuid,p_order_id,v_quantity,'restock','Order cancelled: recorded sale use',
          v_before,v_before+v_quantity,v_order.shop_id,v_order.branch_id);
      else
        for v_a in select x from jsonb_array_elements(v_d->'allocations') x loop
          v_quantity:=(v_a->>'quantity')::numeric;
          if not exists(select 1 from talvo.inventory_locations loc where loc.id=(v_a->>'location_id')::uuid
            and loc.business_id=v_order.shop_id and loc.branch_id=v_order.branch_id and loc.kind='BRANCH_AVAILABLE') then
            raise exception 'INVALID_INVENTORY_SNAPSHOT' using errcode='P0001';
          end if;
          update talvo.inventory_balances set quantity_base=quantity_base-v_quantity,version=version+1,updated_at=clock_timestamp()
          where business_id=v_order.shop_id and location_id=v_consumed
            and ingredient_lot_id=(v_a->>'ingredient_lot_id')::uuid and quantity_base>=v_quantity;
          if not found then raise exception 'INVALID_INVENTORY_SNAPSHOT' using errcode='P0001'; end if;
          update talvo.inventory_balances set quantity_base=quantity_base+v_quantity,version=version+1,updated_at=clock_timestamp()
          where business_id=v_order.shop_id and location_id=(v_a->>'location_id')::uuid
            and ingredient_lot_id=(v_a->>'ingredient_lot_id')::uuid;
          if not found then raise exception 'INVALID_INVENTORY_SNAPSHOT' using errcode='P0001'; end if;
        end loop;
      end if;
    end loop;
  end if;
  update public.orders set status='cancelled',cancel_reason=p_reason,cancel_note=nullif(left(btrim(p_note),200),''),
    cancelled_by=v_role,cancelled_at=clock_timestamp(),stock_refunded=p_restock,
    stock_refunded_at=case when p_restock then clock_timestamp() else null end where id=p_order_id;
  return jsonb_build_object('success',true,'order_id',p_order_id,'status','cancelled','restock',p_restock,'stock_refunded',p_restock);
end $$;
revoke all on function public.cancel_order(uuid,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.cancel_order(uuid,text,text,text,boolean) to authenticated;

-- Legacy sales retain the existing cancellation calculation, scoped to their own branch.
-- New branch recipes must never expand an old sale refund into another inventory.
CREATE OR REPLACE FUNCTION public.cancel_order_without_business_day_guard(p_order_id uuid, p_reason text, p_note text DEFAULT NULL::text, p_cancelled_by text DEFAULT NULL::text, p_restock boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$
declare
  v_order record;
  v_note text;
begin
  -- 1) lock order กันยิงซ้ำ
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  -- 2) ถ้ายกเลิกไปแล้ว -> return แบบไม่ทำซ้ำ
  if lower(coalesce(v_order.status,'')) = 'cancelled' then
    return jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'status', v_order.status,
      'already_cancelled', true,
      'stock_refunded', coalesce(v_order.stock_refunded, false)
    );
  end if;

  -- 3) ต้องเป็น paid เท่านั้น
  if lower(coalesce(v_order.status,'')) <> 'paid' then
    return jsonb_build_object('success', false, 'error', 'order_not_paid', 'status', v_order.status);
  end if;

  -- 4) validate reason
  if p_reason not in (
    'ลูกค้ายกเลิก',
    'กดผิด / ชงผิด',
    'วัตถุดิบไม่พอ',
    'ระบบขัดข้อง',
    'อื่นๆ'
  ) then
    return jsonb_build_object('success', false, 'error', 'invalid_reason');
  end if;

  -- 5) other ต้องมี note
  v_note := nullif(left(btrim(coalesce(p_note,'')), 200), '');
  if p_reason = 'อื่นๆ' and v_note is null then
    return jsonb_build_object('success', false, 'error', 'note_required_for_other');
  end if;

  -- 6) update order -> cancelled
  update public.orders
  set
    status = 'cancelled',
    cancel_reason = p_reason,
    cancel_note = v_note,
    cancelled_by = p_cancelled_by,
    cancelled_at = now()
  where id = p_order_id;

  /*
    7) สต็อก:
    - ถ้า p_restock = true: คืนสต็อก (ครั้งเดียว) + log type='restock'
    - ถ้า p_restock = false: ไม่คืนสต็อก แต่ log type='waste' (เพื่อให้ Stock History เห็นว่า "เสียไปกับการยกเลิก")
  */

  with usage as (
    select
      ri.ingredient_id,
      sum((ri.quantity::numeric) * (oi.qty::numeric)) as qty
    from public.order_items oi
    join public.recipe_items ri
      on ri.variant_id = oi.variant_id
      and ri.shop_id = v_order.shop_id
      and ri.branch_id = v_order.branch_id
    where oi.order_id = p_order_id
      and oi.shop_id = v_order.shop_id
    group by ri.ingredient_id
  )
  -- คืนสต็อก
  , applied as (
    update public.ingredients i
    set
      stock = case
        when p_restock = true and coalesce(v_order.stock_refunded,false) = false
          then coalesce(i.stock,0) + u.qty
        else i.stock
      end,
      updated_at = case
        when p_restock = true and coalesce(v_order.stock_refunded,false) = false
          then now()
        else i.updated_at
      end
    from usage u
    where i.id = u.ingredient_id
      and i.shop_id = v_order.shop_id
      and i.branch_id = v_order.branch_id
    returning u.ingredient_id, u.qty
  )
  insert into public.stock_logs (ingredient_id, order_id, amount, type, note, created_at, shop_id, branch_id)
  select
    a.ingredient_id,
    p_order_id,
    a.qty,
    case when p_restock then 'restock' else 'waste' end,
    case
      when p_restock then 'Order cancelled: restock'
      else 'Order cancelled: waste'
    end,
    now(),
    v_order.shop_id,
    v_order.branch_id
  from applied a;

  -- 8) set stock_refunded flags เฉพาะกรณี restock จริง และยังไม่เคยคืน
  if p_restock = true and coalesce(v_order.stock_refunded,false) = false then
    update public.orders
    set stock_refunded = true,
        stock_refunded_at = now()
    where id = p_order_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'cancelled',
    'restock', p_restock,
    'stock_refunded', case when p_restock then true else false end
  );
end;
$$;
revoke all on function public.cancel_order_without_business_day_guard(uuid,text,text,text,boolean) from public,anon,authenticated,service_role;
