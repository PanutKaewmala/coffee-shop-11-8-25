-- Configuration only. Quantities continue to live in the existing inventory stores.
create table talvo.branch_stock_minimums (
  business_id uuid not null,
  branch_id uuid not null,
  supply_item_id uuid not null,
  minimum_stock numeric(18,6) not null check (minimum_stock >= 0 and minimum_stock::text not in ('NaN','Infinity','-Infinity')),
  primary key (branch_id, supply_item_id),
  foreign key (business_id, branch_id) references public.branch(shop_id,id),
  foreign key (business_id, supply_item_id) references talvo.supply_items(business_id,id)
);
alter table talvo.branch_stock_minimums enable row level security;
revoke all on talvo.branch_stock_minimums from public, anon, authenticated, service_role;

-- Same narrow, authenticated RPC boundary as list_talvo_supply_items. No table exposure.
create function public.get_recipe_usable_stock(p_business_id uuid, p_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare v_role text; v_branch text; v_active boolean; v_items jsonb;
begin
  select role into v_role from public.shop_members
  where shop_id=p_business_id and user_id=auth.uid() and role in ('owner','staff');
  if auth.uid() is null or v_role is null then
    raise exception 'OWNER_OR_STAFF_REQUIRED' using errcode='42501';
  end if;
  select name,is_active into v_branch,v_active from public.branch where shop_id=p_business_id and id=p_branch_id;
  if not found then raise exception 'INVALID_BRANCH' using errcode='22023'; end if;

  with used as (
    select distinct ingredient_id,supply_item_id from public.recipe_items
    where shop_id=p_business_id and branch_id=p_branch_id
  ), items as (
    select 'supply_item'::text source_type,s.id, s.name,u.symbol unit, m.minimum_stock,
      case when not v_active then 'BRANCH_INACTIVE'
        when s.archived_at is not null then 'ITEM_ARCHIVED' end unavailable_reason,
      coalesce((select sum(b.quantity_base) from talvo.inventory_balances b
        join talvo.inventory_locations loc on loc.id=b.location_id and loc.business_id=b.business_id
        join talvo.ingredient_lots lot on lot.id=b.ingredient_lot_id and lot.business_id=b.business_id
        where b.business_id=p_business_id and loc.branch_id=p_branch_id and loc.kind='BRANCH_AVAILABLE'
          and lot.supply_item_id=s.id and lot.status='ACTIVE' and lot.provenance_status='VERIFIED'
          and (lot.system_branch_id is null or lot.system_branch_id=p_branch_id)
          and (lot.effective_use_by_at is null or lot.effective_use_by_at>statement_timestamp())),0) usable_stock
    from used r join talvo.supply_items s on s.id=r.supply_item_id and s.business_id=p_business_id
    join talvo.units u on u.id=s.base_unit_id
    left join talvo.branch_stock_minimums m on m.business_id=p_business_id and m.branch_id=p_branch_id and m.supply_item_id=s.id
    union all
    select 'ingredient',i.id,i.name,i.base_unit,i.min_stock,
      case when not i.is_active or i.archived_at is not null then 'ITEM_ARCHIVED'
        when i.track_lots or i.expiry_tracking_enabled or exists (
          select 1 from public.ingredient_lots l where l.ingredient_id=i.id and l.shop_id=p_business_id and l.branch_id=p_branch_id
        ) then 'LEGACY_LOT_BALANCE_UNAVAILABLE'
        when i.stock is null or i.stock::text in ('NaN','Infinity','-Infinity') then 'INVALID_BALANCE' end,
      greatest(i.stock,0)
    from used r join public.ingredients i on i.id=r.ingredient_id and i.shop_id=p_business_id and i.branch_id=p_branch_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_type',source_type,'id',id,'name',name,'unit',unit,'minimum_stock',minimum_stock,
    'usable_stock',case when unavailable_reason is null then usable_stock end,
    'unavailable_reason',unavailable_reason
  ) order by name,source_type,id),'[]'::jsonb) into v_items from items;
  if jsonb_array_length(v_items) <> (select count(*) from (
    select distinct ingredient_id,supply_item_id from public.recipe_items where shop_id=p_business_id and branch_id=p_branch_id
  ) r) then raise exception 'INCOMPLETE_RECIPE_STOCK' using errcode='55000'; end if;
  return jsonb_build_object('branch_id',p_branch_id,'branch_name',v_branch,'shop_id',p_business_id,
    'as_of',statement_timestamp(),'can_edit_minimum',v_role='owner','items',v_items);
end $$;
revoke all on function public.get_recipe_usable_stock(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_recipe_usable_stock(uuid,uuid) to authenticated;

create function public.set_recipe_stock_minimum(
  p_business_id uuid,p_branch_id uuid,p_source_type text,p_item_id uuid,p_minimum_stock numeric
) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.shop_members
    where shop_id=p_business_id and user_id=auth.uid() and role='owner') then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;
  if not exists(select 1 from public.branch where shop_id=p_business_id and id=p_branch_id) then
    raise exception 'INVALID_BRANCH' using errcode='22023';
  end if;
  perform public.assert_business_day_open(p_business_id,p_branch_id,(now() at time zone 'Asia/Bangkok')::date);
  if p_minimum_stock is null or p_minimum_stock::text in ('NaN','Infinity','-Infinity')
    or p_minimum_stock<0 or p_minimum_stock>999999999999.999999 or p_minimum_stock<>trunc(p_minimum_stock,6) then
    raise exception 'INVALID_MINIMUM' using errcode='22023';
  end if;
  if p_source_type='supply_item' and exists(select 1 from public.recipe_items
    where shop_id=p_business_id and branch_id=p_branch_id and supply_item_id=p_item_id) then
    insert into talvo.branch_stock_minimums(business_id,branch_id,supply_item_id,minimum_stock)
    values(p_business_id,p_branch_id,p_item_id,p_minimum_stock)
    on conflict(branch_id,supply_item_id) do update set minimum_stock=excluded.minimum_stock
    where talvo.branch_stock_minimums.business_id=p_business_id;
  elsif p_source_type='ingredient' and exists(select 1 from public.recipe_items
    where shop_id=p_business_id and branch_id=p_branch_id and ingredient_id=p_item_id) then
    update public.ingredients set min_stock=p_minimum_stock
    where id=p_item_id and shop_id=p_business_id and branch_id=p_branch_id;
  else raise exception 'RECIPE_ITEM_NOT_FOUND' using errcode='22023'; end if;
end $$;
revoke all on function public.set_recipe_stock_minimum(uuid,uuid,text,uuid,numeric) from public,anon,authenticated,service_role;
grant execute on function public.set_recipe_stock_minimum(uuid,uuid,text,uuid,numeric) to authenticated;
