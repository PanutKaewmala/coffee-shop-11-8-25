-- Atomic POS checkout: idempotency, order, items, stock, and logs commit together.
-- The function deliberately replaces the legacy two-argument checkout RPC.
create extension if not exists pgcrypto;

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
set search_path = public, pg_temp
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
  v_failpoint text := coalesce(current_setting('app.pos_checkout_test_failpoint', true), '');
begin
  if v_user_id is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;
  if not exists (
    select 1 from public.shop_members sm
    where sm.user_id = v_user_id and sm.shop_id = p_shop_id
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

  v_request_hash := encode(digest(
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
    variant_id uuid primary key,
    qty integer not null,
    sweetness text not null,
    menu_id uuid,
    item_name text,
    price numeric,
    variant_label text
  ) on commit drop;
  truncate pg_temp.pos_checkout_lines;

  insert into pg_temp.pos_checkout_lines (variant_id, qty, sweetness)
  select x.variant_id, sum(x.qty)::integer, min(x.sweetness)
  from (
    select
      nullif(item->>'variant_id', '')::uuid variant_id,
      (item->>'qty')::integer qty,
      coalesce(nullif(item->>'sweetness', ''), '100%') sweetness
    from jsonb_array_elements(p_items) item
  ) x
  where x.variant_id is not null and x.qty > 0
  group by x.variant_id;

  if (select coalesce(sum(qty), 0) from pg_temp.pos_checkout_lines) < 1
     or (select count(*) from pg_temp.pos_checkout_lines) <>
        (select count(distinct item->>'variant_id') from jsonb_array_elements(p_items) item) then
    raise exception 'Invalid items';
  end if;

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

  if v_failpoint = 'after_order' then raise exception 'POS_TEST_FAILURE_AFTER_ORDER'; end if;

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

    if v_failpoint = 'during_stock_log' then
      raise exception 'POS_TEST_FAILURE_DURING_STOCK_LOG';
    end if;

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
      ) order by variant_id) from pg_temp.pos_checkout_lines)
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

revoke all on function public.process_pos_checkout(uuid, uuid, jsonb, text, numeric, text) from public;
grant execute on function public.process_pos_checkout(uuid, uuid, jsonb, text, numeric, text)
  to authenticated, service_role;

comment on function public.process_pos_checkout(uuid, uuid, jsonb, text, numeric, text) is
  'Atomic POS checkout. Advisory-locks idempotency keys and row-locks ingredient stock.';
