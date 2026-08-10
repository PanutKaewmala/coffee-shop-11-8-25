-- Full atomic POS checkout and shared business-day serialization.
-- Review only: do not apply to staging or production from this repository task.

alter table public.pos_idempotency
  add column if not exists request_hash text;

create unique index if not exists pos_idempotency_shop_key_uidx
  on public.pos_idempotency (shop_id, key);

create or replace function public.lock_business_day(
  p_shop_id uuid, p_branch_id uuid, p_business_date date
) returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'business-day:' || p_shop_id::text || ':' || p_branch_id::text || ':' || p_business_date::text,
      0
    )
  );
end;
$$;
revoke all on function public.lock_business_day(uuid, uuid, date) from public, anon, authenticated, service_role;

create or replace function public.assert_business_day_open(
  p_shop_id uuid, p_branch_id uuid, p_business_date date
) returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  perform public.lock_business_day(p_shop_id, p_branch_id, p_business_date);
  if exists (
    select 1 from public.daily_closes
    where shop_id = p_shop_id and branch_id = p_branch_id
      and business_date = p_business_date and status in ('closed', 'approved')
  ) then
    raise exception 'BUSINESS_DAY_CLOSED' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.assert_business_day_open(uuid, uuid, date) from public, anon, authenticated, service_role;

create or replace function public.process_pos_checkout_atomic(
  p_shop_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_paid_amount numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_business_date date := (pg_catalog.now() at time zone 'Asia/Bangkok')::date;
  v_request_hash text;
  v_existing_hash text;
  v_response jsonb;
  v_order_id uuid;
  v_created_at timestamptz;
  v_paid_at timestamptz;
  v_total numeric;
  v_change numeric;
  v_ing record;
begin
  if p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 8 and 200 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_ITEMS' using errcode = '22023';
  end if;

  select sm.role into v_role
  from public.shop_members sm
  where sm.shop_id = p_shop_id and sm.user_id = v_actor;
  if v_actor is null or v_role not in ('owner', 'staff') then
    raise exception 'OWNER_OR_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.branch b where b.id = p_branch_id and b.shop_id = p_shop_id) then
    raise exception 'INVALID_BRANCH' using errcode = '22023';
  end if;

  v_request_hash := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'shop_id', p_shop_id, 'branch_id', p_branch_id,
      'items', p_items, 'payment_method', p_payment_method, 'paid_amount', p_paid_amount
    )::text, 'UTF8'), 'sha256'), 'hex');

  -- The idempotency lock is the first side-effecting operation. It serializes
  -- every request for a shop/key before temp tables, orders, stock or logs.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-idempotency:' || p_shop_id::text || ':' || p_idempotency_key, 0)
  );

  select request_hash, response into v_existing_hash, v_response
  from public.pos_idempotency
  where shop_id = p_shop_id and key = p_idempotency_key;
  if found then
    if v_existing_hash is distinct from v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' using errcode = 'P0001';
    end if;
    return v_response;
  end if;

  if p_payment_method not in ('cash', 'promptpay') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;

  perform public.assert_business_day_open(p_shop_id, p_branch_id, v_business_date);

  create temporary table if not exists pg_temp.pos_lines(
    variant_id uuid, sweetness text, qty integer, menu_id uuid,
    item_name text, unit_price numeric, variant_label text,
    primary key (variant_id, sweetness)
  ) on commit drop;
  truncate pg_temp.pos_lines;

  insert into pg_temp.pos_lines(variant_id, sweetness, qty, menu_id, item_name, unit_price, variant_label)
  select parsed.variant_id, parsed.sweetness, sum(parsed.qty)::integer,
         mv.menu_id, m.name, coalesce(mv.price_override, m.price),
         pg_catalog.concat_ws(' / ', nullif(pg_catalog.concat_ws(' ', mst.name, nullif(mv.size, 'default')), ''), 'หวาน ' || parsed.sweetness)
  from (
    select (line->>'variant_id')::uuid variant_id,
           line->>'sweetness' sweetness,
           (line->>'qty')::integer qty
    from pg_catalog.jsonb_array_elements(p_items) as x(line)
  ) parsed
  join public.menu_variants mv on mv.id = parsed.variant_id and mv.shop_id = p_shop_id
  join public.menu m on m.id = mv.menu_id and m.shop_id = p_shop_id
  left join public.menu_serve_types mst on mst.id = mv.serve_type_id and mst.shop_id = p_shop_id
  where parsed.sweetness in ('0%', '25%', '50%', '75%', '100%', '125%') and parsed.qty > 0
  group by parsed.variant_id, parsed.sweetness, mv.menu_id, m.name, mv.price_override, m.price, mst.name, mv.size;

  if (select coalesce(sum(qty),0) from pg_temp.pos_lines) <>
     (select coalesce(sum((line->>'qty')::integer),0) from pg_catalog.jsonb_array_elements(p_items) as x(line)) then
    raise exception 'INVALID_VARIANT_SWEETNESS_OR_QUANTITY' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_temp.pos_lines l where not exists (
      select 1 from public.recipe_items r where r.shop_id=p_shop_id and r.variant_id=l.variant_id
    )
  ) then raise exception 'NO_RECIPE' using errcode='P0001'; end if;
  if exists (
    select 1 from pg_temp.pos_lines l
    join public.recipe_items r on r.shop_id=p_shop_id and r.variant_id=l.variant_id
    where r.quantity is null or r.quantity <= 0
  ) then raise exception 'INVALID_RECIPE_QUANTITY' using errcode='P0001'; end if;
  if exists (
    select 1 from pg_temp.pos_lines l
    join public.recipe_items r on r.shop_id=p_shop_id and r.variant_id=l.variant_id
    left join public.ingredients i on i.id=r.ingredient_id
      and i.shop_id=p_shop_id and i.branch_id=p_branch_id
    where i.id is null
  ) then raise exception 'RECIPE_INGREDIENT_OUTSIDE_BRANCH' using errcode='P0001'; end if;

  create temporary table if not exists pg_temp.pos_deductions(
    ingredient_id uuid primary key, required_qty numeric, before_stock numeric
  ) on commit drop;
  truncate pg_temp.pos_deductions;
  insert into pg_temp.pos_deductions(ingredient_id, required_qty)
  select r.ingredient_id, sum(r.quantity * l.qty)
  from pg_temp.pos_lines l
  join public.recipe_items r on r.shop_id=p_shop_id and r.variant_id=l.variant_id
  group by r.ingredient_id;

  -- Lock all affected ingredients in stable UUID order before validating any stock.
  perform i.id from public.ingredients i
  join pg_temp.pos_deductions d on d.ingredient_id=i.id
  where i.shop_id=p_shop_id and i.branch_id=p_branch_id
  order by i.id
  for update of i;

  update pg_temp.pos_deductions d set before_stock=i.stock
  from public.ingredients i
  where i.id=d.ingredient_id and i.shop_id=p_shop_id and i.branch_id=p_branch_id;
  if exists(select 1 from pg_temp.pos_deductions where before_stock is null) then
    raise exception 'INGREDIENT_NOT_FOUND_FOR_BRANCH' using errcode='P0001';
  end if;
  if exists(select 1 from pg_temp.pos_deductions where before_stock < required_qty) then
    raise exception 'NOT_ENOUGH_STOCK' using errcode='P0001';
  end if;

  select sum(unit_price * qty) into v_total from pg_temp.pos_lines;
  if p_payment_method='cash' and (p_paid_amount is null or p_paid_amount < v_total) then
    raise exception 'INSUFFICIENT_PAYMENT' using errcode='22023';
  end if;
  v_change := case when p_payment_method='cash' then p_paid_amount-v_total else 0 end;

  v_paid_at := pg_catalog.now();
  insert into public.orders(shop_id,branch_id,total,status,payment_method,paid_amount,change_amount,paid_at)
  values(p_shop_id,p_branch_id,v_total,'paid',p_payment_method,
         case when p_payment_method='promptpay' then v_total else p_paid_amount end,v_change,v_paid_at)
  returning id,created_at into v_order_id,v_created_at;

  insert into public.order_items(order_id,menu_id,variant_id,variant_label,name,price,qty,shop_id)
  select v_order_id,menu_id,variant_id,variant_label,item_name,unit_price,qty,p_shop_id
  from pg_temp.pos_lines order by variant_id,sweetness;

  for v_ing in select * from pg_temp.pos_deductions order by ingredient_id loop
    update public.ingredients set stock=v_ing.before_stock-v_ing.required_qty
    where id=v_ing.ingredient_id and shop_id=p_shop_id and branch_id=p_branch_id;
    insert into public.stock_logs(ingredient_id,order_id,amount,type,note,before_stock,after_stock,shop_id,branch_id)
    values(v_ing.ingredient_id,v_order_id,v_ing.required_qty,'deduct','',v_ing.before_stock,
           v_ing.before_stock-v_ing.required_qty,p_shop_id,p_branch_id);
  end loop;

  v_response := pg_catalog.jsonb_build_object(
    'success',true,'order',pg_catalog.jsonb_build_object(
      'id',v_order_id,'total',v_total,'created_at',v_created_at,'status','paid',
      'payment_method',p_payment_method,'paid_at',v_paid_at,'note',null,
      'shop_id',p_shop_id,'branch_id',p_branch_id,
      'items',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'menu_id',l.menu_id,'variant_id',l.variant_id,'variant_label',l.variant_label,
        'name',l.item_name,'price',l.unit_price,'qty',l.qty
      ) order by l.variant_id,l.sweetness) from pg_temp.pos_lines l)
    ),
    'deducted',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'ingredient_id',d.ingredient_id,'deduct',d.required_qty,
      'before_stock',d.before_stock,'after_stock',d.before_stock-d.required_qty
    ) order by d.ingredient_id) from pg_temp.pos_deductions d)
  );
  insert into public.pos_idempotency(key,shop_id,request_hash,response)
  values(p_idempotency_key,p_shop_id,v_request_hash,v_response);
  return v_response;
end;
$$;
revoke all on function public.process_pos_checkout_atomic(uuid,uuid,jsonb,text,numeric,text) from public, anon, service_role;
grant execute on function public.process_pos_checkout_atomic(uuid,uuid,jsonb,text,numeric,text) to authenticated;

create or replace function public.create_cash_movement_atomic(
 p_shop_id uuid,p_branch_id uuid,p_business_date date,p_type text,p_reason text,p_amount numeric,p_note text
) returns public.cash_movements
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_role text; v_row public.cash_movements; v_requires_note boolean; v_owner_only boolean;
begin
 select sm.role into v_role from public.shop_members sm where sm.shop_id=p_shop_id and sm.user_id=v_actor;
 if v_actor is null or v_role not in ('owner','staff') then raise exception 'OWNER_OR_STAFF_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.branch b where b.id=p_branch_id and b.shop_id=p_shop_id) then raise exception 'INVALID_BRANCH' using errcode='22023'; end if;
 select x.requires_note,x.owner_only into v_requires_note,v_owner_only from (values
  ('cash_in','เติมเงินทอน',false,false),('cash_in','เงินคืน / รับเงินสดอื่น',true,false),('cash_in','ปรับยอดเงินสด',true,true),
  ('cash_out','ซื้อวัตถุดิบเข้าร้าน',false,false),('cash_out','ซื้อบรรจุภัณฑ์ / ของใช้ร้าน',true,false),
  ('cash_out','ค่าใช้จ่ายร้าน',true,false),('cash_out','ฝากธนาคาร',false,false),('cash_out','เจ้าของถอนเงิน',true,true),
  ('cash_out','ปรับยอดเงินสด',true,true)
 ) as x(kind,reason,requires_note,owner_only) where x.kind=p_type and x.reason=p_reason;
 if not found then raise exception 'INVALID_CASH_MOVEMENT_REASON_FOR_TYPE' using errcode='22023'; end if;
 if v_owner_only and v_role<>'owner' then raise exception 'OWNER_REQUIRED_FOR_CASH_MOVEMENT_REASON' using errcode='42501'; end if;
 if v_requires_note and NULLIF(pg_catalog.btrim(p_note),'') is null then raise exception 'CASH_MOVEMENT_NOTE_REQUIRED' using errcode='22023'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_CASH_MOVEMENT_AMOUNT' using errcode='22023'; end if;
 perform public.assert_business_day_open(p_shop_id,p_branch_id,p_business_date);
 insert into public.cash_movements(shop_id,branch_id,business_date,type,reason,amount,note,created_by)
 values(p_shop_id,p_branch_id,p_business_date,p_type,p_reason,p_amount,p_note,v_actor) returning * into v_row;
 return v_row;
end; $$;
revoke all on function public.create_cash_movement_atomic(uuid,uuid,date,text,text,numeric,text) from public,anon,service_role;
grant execute on function public.create_cash_movement_atomic(uuid,uuid,date,text,text,numeric,text) to authenticated;

-- Preserve the existing stock-restoration implementation as a private primitive.
alter function public.cancel_order(uuid,text,text,text,boolean) rename to cancel_order_without_business_day_guard;
revoke all on function public.cancel_order_without_business_day_guard(uuid,text,text,text,boolean) from public,anon,authenticated,service_role;

create or replace function public.cancel_order(p_order_id uuid,p_reason text,p_note text,p_cancelled_by text,p_restock boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_role text; v_order record; v_date date; v_result jsonb;
begin
 select o.shop_id,o.branch_id,coalesce(o.paid_at,o.created_at) event_at into v_order from public.orders o where o.id=p_order_id;
 if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0001'; end if;
 select sm.role into v_role from public.shop_members sm where sm.shop_id=v_order.shop_id and sm.user_id=v_actor;
 if v_actor is null or v_role not in ('owner','staff') then raise exception 'OWNER_OR_STAFF_REQUIRED' using errcode='42501'; end if;
 v_date := (v_order.event_at at time zone 'Asia/Bangkok')::date;
 perform public.lock_business_day(v_order.shop_id,v_order.branch_id,v_date);
 select o.shop_id,o.branch_id,coalesce(o.paid_at,o.created_at) event_at into v_order from public.orders o where o.id=p_order_id for update;
 v_date := (v_order.event_at at time zone 'Asia/Bangkok')::date;
 if exists(select 1 from public.daily_closes d where d.shop_id=v_order.shop_id and d.branch_id=v_order.branch_id and d.business_date=v_date and d.status in ('closed','approved')) then raise exception 'BUSINESS_DAY_CLOSED' using errcode='P0001'; end if;
 select public.cancel_order_without_business_day_guard(p_order_id,p_reason,p_note,v_role,p_restock) into v_result;
 return v_result;
end; $$;
revoke all on function public.cancel_order(uuid,text,text,text,boolean) from public,anon,service_role;
grant execute on function public.cancel_order(uuid,text,text,text,boolean) to authenticated;

create or replace function public.finalize_daily_close_atomic(
 p_shop_id uuid,p_branch_id uuid,p_business_date date,p_close_id uuid,
 p_counted_cash numeric,p_notes text
) returns public.daily_closes
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_role text; v_close public.daily_closes; v_gross numeric; v_cash numeric; v_promptpay numeric; v_unknown numeric; v_paid_count integer; v_cancelled integer; v_cash_in numeric; v_cash_out numeric; v_expected numeric; v_difference numeric;
begin
 select sm.role into v_role from public.shop_members sm where sm.shop_id=p_shop_id and sm.user_id=v_actor;
 if v_actor is null or v_role<>'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.branch b where b.id=p_branch_id and b.shop_id=p_shop_id) then raise exception 'INVALID_BRANCH' using errcode='22023'; end if;
 -- Lock before reading any value used by the final snapshot.
 perform public.lock_business_day(p_shop_id,p_branch_id,p_business_date);
 select * into v_close from public.daily_closes d where d.id=p_close_id and d.shop_id=p_shop_id and d.branch_id=p_branch_id and d.business_date=p_business_date and d.status='draft' for update;
 if not found then raise exception 'DAILY_CLOSE_NOT_DRAFT' using errcode='P0001'; end if;
 select coalesce(sum(o.total),0),coalesce(sum(o.total) filter(where o.payment_method='cash'),0),coalesce(sum(o.total) filter(where o.payment_method='promptpay'),0),coalesce(sum(o.total) filter(where o.payment_method not in ('cash','promptpay') or o.payment_method is null),0),count(*)::integer
 into v_gross,v_cash,v_promptpay,v_unknown,v_paid_count from public.orders o
 where o.shop_id=p_shop_id and o.branch_id=p_branch_id and o.status='paid' and (coalesce(o.paid_at,o.created_at) at time zone 'Asia/Bangkok')::date=p_business_date;
 select count(*)::integer into v_cancelled from public.orders o where o.shop_id=p_shop_id and o.branch_id=p_branch_id and o.status='cancelled' and (coalesce(o.paid_at,o.created_at) at time zone 'Asia/Bangkok')::date=p_business_date;
 select coalesce(sum(cm.amount) filter(where cm.type='cash_in'),0),coalesce(sum(cm.amount) filter(where cm.type='cash_out'),0) into v_cash_in,v_cash_out from public.cash_movements cm where cm.shop_id=p_shop_id and cm.branch_id=p_branch_id and cm.business_date=p_business_date;
 v_expected:=v_close.opening_cash_float+v_cash+v_cash_in-v_cash_out; v_difference:=p_counted_cash-v_expected;
 if p_counted_cash is null or p_counted_cash<0 then raise exception 'INVALID_COUNTED_CASH' using errcode='22023'; end if;
 if pg_catalog.abs(v_difference)>=0.01 and NULLIF(pg_catalog.btrim(p_notes),'') is null then raise exception 'CASH_DIFFERENCE_REASON_REQUIRED' using errcode='22023'; end if;
 update public.daily_closes set status='closed',counted_cash=p_counted_cash,expected_cash=v_expected,cash_difference=v_difference,notes=p_notes,closed_by=v_actor,closed_at=pg_catalog.now(),gross_sales=v_gross,net_sales=v_gross,cash_sales=v_cash,promptpay_sales=v_promptpay,unknown_payment_sales=v_unknown,paid_order_count=v_paid_count,cancelled_order_count=v_cancelled,refunded_order_count=0,void_order_count=0 where id=p_close_id returning * into v_close;
 return v_close;
end; $$;
revoke all on function public.finalize_daily_close_atomic(uuid,uuid,date,uuid,numeric,text) from public,anon,service_role;
grant execute on function public.finalize_daily_close_atomic(uuid,uuid,date,uuid,numeric,text) to authenticated;
