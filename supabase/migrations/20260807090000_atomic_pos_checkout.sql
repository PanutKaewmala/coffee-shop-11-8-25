-- Atomic POS checkout: idempotency, order, items, stock, and logs commit together.
-- The function deliberately replaces the legacy two-argument checkout RPC.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.pos_idempotency
  add column if not exists request_hash text,
  add column if not exists order_id uuid,
  add column if not exists branch_id uuid;

create unique index if not exists pos_idempotency_shop_key_uidx
  on public.pos_idempotency (shop_id, key);

create index if not exists pos_idempotency_order_idx
  on public.pos_idempotency (order_id)
  where order_id is not null;

-- Drop only the obsolete signature. Existing callers must not accidentally use
-- a function that performs a partial checkout.
drop function if exists public.process_pos_checkout(uuid, jsonb);

create or replace function public.process_pos_checkout(
  p_shop_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_paid_amount numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_hash text;
  v_existing public.pos_idempotency%rowtype;
  v_order public.orders%rowtype;
  v_total numeric := 0;
  v_paid_amount numeric;
  v_change_amount numeric := 0;
  v_result jsonb;
  v_business_date date := (clock_timestamp() at time zone 'Asia/Bangkok')::date;
  v_row record;
  v_before numeric;
begin
  if v_user_id is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;
  if not exists (
    select 1 from public.shop_members sm
    where sm.user_id = v_user_id and sm.shop_id = p_shop_id
      and sm.role in ('owner', 'staff')
  ) then
    raise exception using message = 'Shop access denied', errcode = '42501';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8
     or length(p_idempotency_key) > 200 then
    raise exception 'Invalid idempotency key';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Invalid items';
  end if;
  if p_payment_method not in ('cash', 'promptpay') then
    raise exception 'Invalid payment method';
  end if;

  -- A transaction-scoped advisory lock claims this shop/key before any side
  -- effect. Identical concurrent requests wait here and then return the result
  -- committed by the winner.
  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':' || p_idempotency_key, 0)
  );

  v_request_hash := encode(extensions.digest(
    jsonb_build_object(
      'shop_id', p_shop_id,
      'branch_id', p_branch_id,
      'items', p_items,
      'payment_method', p_payment_method,
      'paid_amount', p_paid_amount
    )::text,
    'sha256'
  ), 'hex');

  select * into v_existing
  from public.pos_idempotency
  where shop_id = p_shop_id and key = p_idempotency_key;

  if found then
    if v_existing.request_hash is not null and v_existing.request_hash <> v_request_hash then
      raise exception 'Idempotency key reused with a different request';
    end if;
    return v_existing.response;
  end if;

  -- Serialize all activity that can finalize or add sales to this business day.
  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':' || p_branch_id::text || ':' || v_business_date::text, 0
  ));

  -- Lock the branch while validating tenant ownership. Ingredient rows are
  -- locked later in stable UUID order to avoid deadlocks between baskets.
  perform 1 from public.branch b
  where b.id = p_branch_id and b.shop_id = p_shop_id
  for share;
  if not found then raise exception 'Invalid branch'; end if;

  if exists (
    select 1 from public.daily_closes dc
    where dc.shop_id = p_shop_id
      and dc.branch_id = p_branch_id
      and dc.business_date = v_business_date
      and dc.status in ('closed', 'approved')
  ) then
    raise exception 'BUSINESS_DAY_CLOSED';
  end if;

  create temporary table if not exists pg_temp.pos_checkout_lines (
    variant_id uuid not null,
    qty integer not null,
    sweetness text not null,
    primary key (variant_id, sweetness),
    menu_id uuid,
    item_name text,
    price numeric,
    variant_label text
  ) on commit drop;
  truncate pg_temp.pos_checkout_lines;

  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
       or coalesce(item->>'variant_id', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or coalesce(item->>'qty', '') !~ '^[1-9][0-9]*$'
       or item->>'sweetness' not in ('0%', '25%', '50%', '75%', '100%', '125%')
  ) then
    raise exception 'Invalid items';
  end if;

  insert into pg_temp.pos_checkout_lines (variant_id, qty, sweetness)
  select (item->>'variant_id')::uuid, sum((item->>'qty')::integer), item->>'sweetness'
  from jsonb_array_elements(p_items) item
  group by (item->>'variant_id')::uuid, item->>'sweetness';

  update pg_temp.pos_checkout_lines l
  set menu_id = mv.menu_id,
      item_name = m.name,
      price = coalesce(mv.price_override, m.price, 0),
      variant_label = concat_ws(' / ',
        nullif(btrim(regexp_replace(concat_ws(' / ', mst.name, mv.size), '\\mdefault\\M', '', 'gi')), ''),
        'หวาน ' || l.sweetness
      )
  from public.menu_variants mv
  join public.menu m on m.id = mv.menu_id and m.shop_id = p_shop_id
  left join public.menu_serve_types mst
    on mst.id = mv.serve_type_id and mst.shop_id = p_shop_id
  where mv.id = l.variant_id and mv.shop_id = p_shop_id;

  if exists (select 1 from pg_temp.pos_checkout_lines where menu_id is null) then
    raise exception 'Variant not found';
  end if;

  create temporary table if not exists pg_temp.pos_checkout_deductions (
    ingredient_id uuid primary key,
    deduct numeric not null,
    before_stock numeric,
    after_stock numeric
  ) on commit drop;
  truncate pg_temp.pos_checkout_deductions;

  insert into pg_temp.pos_checkout_deductions (ingredient_id, deduct)
  select ri.ingredient_id, sum(ri.quantity * l.qty)
  from pg_temp.pos_checkout_lines l
  join public.recipe_items ri
    on ri.variant_id = l.variant_id and ri.shop_id = p_shop_id
  join public.ingredients i
    on i.id = ri.ingredient_id
   and i.shop_id = p_shop_id and i.branch_id = p_branch_id
  where ri.quantity > 0
  group by ri.ingredient_id;

  if exists (
    select 1 from pg_temp.pos_checkout_lines l
    where not exists (
      select 1 from public.recipe_items ri
      join public.ingredients i on i.id = ri.ingredient_id
      where ri.variant_id = l.variant_id and ri.shop_id = p_shop_id
        and i.shop_id = p_shop_id and i.branch_id = p_branch_id
        and ri.quantity > 0
    )
  ) then
    raise exception 'No recipe for checkout variant';
  end if;

  -- FOR UPDATE serializes stock validation/deduction. Stable ordering prevents
  -- two multi-ingredient baskets from taking locks in opposite orders.
  for v_row in
    select i.id, i.name, i.stock, d.deduct
    from pg_temp.pos_checkout_deductions d
    join public.ingredients i on i.id = d.ingredient_id
    order by i.id
    for update of i
  loop
    if v_row.stock < v_row.deduct then
      raise exception 'Not enough stock: % (need %, have %)',
        v_row.name, v_row.deduct, v_row.stock;
    end if;
    update pg_temp.pos_checkout_deductions
    set before_stock = v_row.stock, after_stock = v_row.stock - v_row.deduct
    where ingredient_id = v_row.id;
  end loop;

  select sum(price * qty) into v_total from pg_temp.pos_checkout_lines;
  v_paid_amount := case when p_payment_method = 'promptpay' then v_total else p_paid_amount end;
  if v_paid_amount is null then raise exception 'paid_amount is required for cash payment'; end if;
  if v_paid_amount < v_total then
    raise exception 'Insufficient payment. Total is %, received %', v_total, v_paid_amount;
  end if;
  if p_payment_method = 'cash' then v_change_amount := v_paid_amount - v_total; end if;

  insert into public.orders (
    total, status, payment_method, paid_amount, change_amount, paid_at,
    note, shop_id, branch_id
  ) values (
    v_total, 'paid', p_payment_method, v_paid_amount, v_change_amount, now(),
    null, p_shop_id, p_branch_id
  ) returning * into v_order;

  insert into public.order_items (
    order_id, menu_id, variant_id, variant_label, name, price, qty, shop_id
  )
  select v_order.id, menu_id, variant_id, variant_label, item_name, price, qty, p_shop_id
  from pg_temp.pos_checkout_lines;

  for v_row in select * from pg_temp.pos_checkout_deductions order by ingredient_id loop
    v_before := v_row.before_stock;
    update public.ingredients
    set stock = v_row.after_stock
    where id = v_row.ingredient_id and shop_id = p_shop_id and branch_id = p_branch_id;

    insert into public.stock_logs (
      ingredient_id, order_id, amount, type, note, before_stock,
      after_stock, shop_id, branch_id
    ) values (
      v_row.ingredient_id, v_order.id, v_row.deduct, 'deduct', '', v_before,
      v_row.after_stock, p_shop_id, p_branch_id
    );
  end loop;

  v_result := jsonb_build_object(
    'success', true,
    'order', jsonb_build_object(
      'id', v_order.id,
      'total', v_order.total,
      'created_at', v_order.created_at,
      'status', v_order.status,
      'payment_method', v_order.payment_method,
      'paid_at', v_order.paid_at,
      'note', v_order.note,
      'shop_id', p_shop_id,
      'branch_id', p_branch_id,
      'items', (select jsonb_agg(jsonb_build_object(
        'menu_id', menu_id, 'variant_id', variant_id,
        'variant_label', variant_label, 'name', item_name,
        'price', price, 'qty', qty
      ) order by variant_id, sweetness) from pg_temp.pos_checkout_lines)
    ),
    'deducted', (select coalesce(jsonb_agg(jsonb_build_object(
      'ingredient_id', ingredient_id, 'deduct', deduct,
      'before_stock', before_stock, 'after_stock', after_stock
    ) order by ingredient_id), '[]'::jsonb) from pg_temp.pos_checkout_deductions)
  );

  insert into public.pos_idempotency
    (key, response, shop_id, branch_id, order_id, request_hash)
  values
    (p_idempotency_key, v_result, p_shop_id, p_branch_id, v_order.id, v_request_hash);

  return v_result;
end;
$$;

-- Cash movements affect expected_cash, so their insert uses the same lock and
-- rechecks the finalized state inside the insert transaction.
create or replace function public.create_cash_movement_guarded(
  p_shop_id uuid,
  p_branch_id uuid,
  p_business_date date,
  p_type text,
  p_reason text,
  p_amount numeric,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_movement public.cash_movements%rowtype;
  v_requires_note boolean;
begin
  if v_user_id is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;
  select sm.role into v_role from public.shop_members sm
  where sm.user_id = v_user_id and sm.shop_id = p_shop_id
    and sm.role in ('owner', 'staff');
  if not found then
    raise exception using message = 'Shop access denied', errcode = '42501';
  end if;
  if not exists (
    select 1 from public.branch b
    where b.id = p_branch_id and b.shop_id = p_shop_id
  ) then
    raise exception using message = 'Invalid branch', errcode = '42501';
  end if;
  if p_type not in ('cash_in', 'cash_out') or p_amount is null or p_amount <= 0 then
    raise exception 'Invalid cash movement';
  end if;

  if not (
    (p_type = 'cash_in' and p_reason in ('เติมเงินทอน', 'เงินคืน / รับเงินสดอื่น', 'ปรับยอดเงินสด'))
    or (p_type = 'cash_out' and p_reason in (
      'ซื้อวัตถุดิบเข้าร้าน', 'ซื้อบรรจุภัณฑ์ / ของใช้ร้าน', 'ค่าใช้จ่ายร้าน',
      'ฝากธนาคาร', 'เจ้าของถอนเงิน', 'ปรับยอดเงินสด'
    ))
  ) then
    raise exception 'Invalid reason for cash movement type';
  end if;
  if p_reason in ('เจ้าของถอนเงิน', 'ปรับยอดเงินสด') and v_role <> 'owner' then
    raise exception using message = 'Owner role required for this cash movement reason', errcode = '42501';
  end if;
  v_requires_note := p_reason in (
    'เงินคืน / รับเงินสดอื่น', 'ปรับยอดเงินสด', 'ซื้อบรรจุภัณฑ์ / ของใช้ร้าน',
    'ค่าใช้จ่ายร้าน', 'เจ้าของถอนเงิน'
  );
  if v_requires_note and nullif(btrim(p_note), '') is null then
    raise exception 'Note is required for this cash movement reason';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':' || p_branch_id::text || ':' || p_business_date::text, 0
  ));
  if exists (
    select 1 from public.daily_closes dc
    where dc.shop_id = p_shop_id and dc.branch_id = p_branch_id
      and dc.business_date = p_business_date and dc.status in ('closed', 'approved')
  ) then
    raise exception 'BUSINESS_DAY_CLOSED';
  end if;

  insert into public.cash_movements (
    shop_id, branch_id, business_date, type, reason, amount, note, created_by
  ) values (
    p_shop_id, p_branch_id, p_business_date, p_type, p_reason,
    round(p_amount, 2), nullif(btrim(p_note), ''), v_user_id
  ) returning * into v_movement;
  return to_jsonb(v_movement);
end;
$$;

revoke all on function public.create_cash_movement_guarded(uuid, uuid, date, text, text, numeric, text) from public;
grant execute on function public.create_cash_movement_guarded(uuid, uuid, date, text, text, numeric, text)
  to authenticated, service_role;

-- Keep the existing cancellation implementation narrowly wrapped: the renamed
-- function still performs status/audit/restock/log mutations, while this public
-- entry point owns tenant validation and the business-day transaction lock.
alter function public.cancel_order(uuid, text, text, text, boolean)
  rename to cancel_order_without_business_day_guard;
revoke all privileges
on function public.cancel_order_without_business_day_guard(
  uuid, text, text, text, boolean
)
from public, anon, authenticated, service_role;

create function public.cancel_order(
  p_order_id uuid,
  p_reason text,
  p_note text default null,
  p_cancelled_by text default null,
  p_restock boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_business_date date;
  v_role text;
begin
  if v_user_id is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;
  select o, sm.role into v_order, v_role
  from public.orders o
  join public.shop_members sm
    on sm.shop_id = o.shop_id and sm.user_id = v_user_id
   and sm.role in ('owner', 'staff')
  where o.id = p_order_id;
  if not found or v_order.branch_id is null then
    raise exception using message = 'Order access denied', errcode = '42501';
  end if;

  v_business_date := (coalesce(v_order.paid_at, v_order.created_at)
    at time zone 'Asia/Bangkok')::date;
  perform pg_advisory_xact_lock(hashtextextended(
    v_order.shop_id::text || ':' || v_order.branch_id::text || ':' || v_business_date::text, 0
  ));

  -- Re-read under the canonical lock before checking the finalized state and
  -- entering the existing cancellation transaction body.
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if exists (
    select 1 from public.daily_closes dc
    where dc.shop_id = v_order.shop_id and dc.branch_id = v_order.branch_id
      and dc.business_date = v_business_date and dc.status in ('closed', 'approved')
  ) then
    raise exception 'BUSINESS_DAY_CLOSED';
  end if;

  return public.cancel_order_without_business_day_guard(
    p_order_id, p_reason, p_note, v_role, p_restock
  );
end;
$$;

revoke all on function public.cancel_order(uuid, text, text, text, boolean) from public;
grant execute on function public.cancel_order(uuid, text, text, text, boolean)
  to authenticated, service_role;

-- Owner-only finalization shares the exact business-day advisory lock with POS.
-- Its report calculation and closed snapshot update are therefore one transaction.
create or replace function public.finalize_daily_close(
  p_shop_id uuid,
  p_branch_id uuid,
  p_business_date date,
  p_counted_cash numeric,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_close public.daily_closes%rowtype;
  v_start timestamptz := p_business_date::timestamp at time zone 'Asia/Bangkok';
  v_end timestamptz := (p_business_date + 1)::timestamp at time zone 'Asia/Bangkok';
  v_gross numeric := 0;
  v_cash numeric := 0;
  v_promptpay numeric := 0;
  v_unknown numeric := 0;
  v_paid_count integer := 0;
  v_cancelled_count integer := 0;
  v_cash_in numeric := 0;
  v_cash_out numeric := 0;
  v_expected numeric;
  v_difference numeric;
begin
  if v_user_id is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;
  if not exists (
    select 1 from public.shop_members sm
    where sm.user_id = v_user_id and sm.shop_id = p_shop_id and sm.role = 'owner'
  ) then
    raise exception using message = 'Owner role required', errcode = '42501';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Invalid counted cash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':' || p_branch_id::text || ':' || p_business_date::text, 0
  ));

  if not exists (
    select 1 from public.branch b
    where b.id = p_branch_id and b.shop_id = p_shop_id
  ) then
    raise exception 'Invalid branch';
  end if;

  select * into v_close
  from public.daily_closes dc
  where dc.shop_id = p_shop_id
    and dc.branch_id = p_branch_id
    and dc.business_date = p_business_date
  for update;

  if not found then raise exception 'Daily close not found'; end if;
  if v_close.status <> 'draft' then raise exception 'Daily close is not draft'; end if;

  select
    coalesce(sum(o.total), 0),
    coalesce(sum(o.total) filter (where lower(o.payment_method) = 'cash'), 0),
    coalesce(sum(o.total) filter (where lower(o.payment_method) = 'promptpay'), 0),
    coalesce(sum(o.total) filter (where lower(coalesce(o.payment_method, '')) not in ('cash', 'promptpay')), 0),
    count(*)::integer
  into v_gross, v_cash, v_promptpay, v_unknown, v_paid_count
  from public.orders o
  where o.shop_id = p_shop_id and o.branch_id = p_branch_id and o.status = 'paid'
    and (
      (o.paid_at is not null and o.paid_at >= v_start and o.paid_at < v_end)
      or (o.paid_at is null and o.created_at >= v_start and o.created_at < v_end)
    );

  select count(*)::integer into v_cancelled_count
  from public.orders o
  where o.shop_id = p_shop_id and o.branch_id = p_branch_id and o.status = 'cancelled'
    and o.cancelled_at >= v_start and o.cancelled_at < v_end;

  select
    coalesce(sum(cm.amount) filter (where cm.type = 'cash_in'), 0),
    coalesce(sum(cm.amount) filter (where cm.type = 'cash_out'), 0)
  into v_cash_in, v_cash_out
  from public.cash_movements cm
  where cm.shop_id = p_shop_id and cm.branch_id = p_branch_id
    and cm.business_date = p_business_date;

  v_gross := round(v_gross, 2);
  v_cash := round(v_cash, 2);
  v_promptpay := round(v_promptpay, 2);
  v_unknown := round(v_unknown, 2);
  v_expected := round(v_close.opening_cash_float + v_cash + v_cash_in - v_cash_out, 2);
  v_difference := round(p_counted_cash - v_expected, 2);

  if v_difference <> 0 and nullif(btrim(p_notes), '') is null then
    raise exception 'Cash difference reason is required';
  end if;

  update public.daily_closes
  set status = 'closed',
      counted_cash = round(p_counted_cash, 2),
      expected_cash = v_expected,
      cash_difference = v_difference,
      closed_by = v_user_id,
      closed_at = now(),
      notes = nullif(btrim(p_notes), ''),
      gross_sales = v_gross,
      net_sales = v_gross,
      cash_sales = v_cash,
      promptpay_sales = v_promptpay,
      unknown_payment_sales = v_unknown,
      paid_order_count = v_paid_count,
      cancelled_order_count = v_cancelled_count,
      refunded_order_count = 0,
      void_order_count = 0,
      updated_at = now()
  where id = v_close.id
  returning * into v_close;

  return to_jsonb(v_close);
end;
$$;

revoke all on function public.finalize_daily_close(uuid, uuid, date, numeric, text) from public;
grant execute on function public.finalize_daily_close(uuid, uuid, date, numeric, text)
  to authenticated, service_role;

revoke all on function public.process_pos_checkout(uuid, uuid, jsonb, text, numeric, text) from public;
grant execute on function public.process_pos_checkout(uuid, uuid, jsonb, text, numeric, text)
  to authenticated, service_role;

comment on function public.process_pos_checkout(uuid, uuid, jsonb, text, numeric, text) is
  'Atomic POS checkout. Advisory-locks idempotency keys and row-locks ingredient stock.';
