-- Atomic and idempotent POS checkout and canonical business-day serialization.
-- This migration is intentionally safe to review without being applied.

create or replace function public.lock_business_day(
  p_shop_id uuid, p_branch_id uuid, p_business_date date
) returns void language plpgsql set search_path = public as $$
begin
  -- A single, canonical transaction lock namespace is shared by checkout,
  -- cash movement, daily close and cancellation paths.
  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':' || p_branch_id::text || ':' || p_business_date::text, 0)
  );
end;
$$;
revoke all on function public.lock_business_day(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.assert_business_day_open(
  p_shop_id uuid, p_branch_id uuid, p_business_date date
) returns void language plpgsql set search_path = public as $$
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
revoke all on function public.assert_business_day_open(uuid, uuid, date) from public, anon, authenticated;

-- The API supplies a stable key. The unique (shop_id,key) constraint is the
-- concurrency boundary: one completed checkout response is reused on retries.
create unique index if not exists pos_idempotency_shop_key_uidx
  on public.pos_idempotency (shop_id, key);

create or replace function public.process_pos_checkout_atomic(
  p_shop_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_paid_amount numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_date date := (now() at time zone 'Asia/Bangkok')::date;
  v_response jsonb;
begin
  if v_actor is null or not exists (
    select 1 from public.shop_members where shop_id=p_shop_id and user_id=v_actor
  ) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not exists (select 1 from public.branch where id=p_branch_id and shop_id=p_shop_id) then
    raise exception 'INVALID_BRANCH' using errcode='P0001';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode='22023';
  end if;

  perform public.assert_business_day_open(p_shop_id,p_branch_id,v_date);
  select response into v_response from public.pos_idempotency
   where shop_id=p_shop_id and key=p_idempotency_key for update;
  if v_response is not null then return v_response; end if;

  -- Keep each variant/sweetness tuple as a distinct line. The legacy checkout
  -- RPC performs all order, item, stock and stock-log writes in this transaction.
  select public.process_pos_checkout(
    p_branch_id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'variant_id', line->>'variant_id',
      'qty', (line->>'qty')::integer,
      'sweetness', coalesce(nullif(line->>'sweetness',''),'100%'),
      'line_identity', line->>'variant_id' || ':' || coalesce(nullif(line->>'sweetness',''),'100%')
    ) order by ord)
    from jsonb_array_elements(p_items) with ordinality as x(line,ord)), '[]'::jsonb)
  ) into v_response;

  insert into public.pos_idempotency(key,response,shop_id)
  values(p_idempotency_key,v_response,p_shop_id)
  on conflict(shop_id,key) do nothing;
  select response into v_response from public.pos_idempotency
   where shop_id=p_shop_id and key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.process_pos_checkout_atomic(uuid,uuid,jsonb,text,numeric,text) from public, anon;
grant execute on function public.process_pos_checkout_atomic(uuid,uuid,jsonb,text,numeric,text) to authenticated;

create or replace function public.create_cash_movement_atomic(
 p_shop_id uuid,p_branch_id uuid,p_business_date date,p_type text,p_reason text,p_amount numeric,p_note text
) returns public.cash_movements language plpgsql security definer set search_path=public as $$
declare v_row public.cash_movements;
begin
 if auth.uid() is null or not exists(select 1 from public.shop_members where shop_id=p_shop_id and user_id=auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform public.assert_business_day_open(p_shop_id,p_branch_id,p_business_date);
 insert into public.cash_movements(shop_id,branch_id,business_date,type,reason,amount,note,created_by)
 values(p_shop_id,p_branch_id,p_business_date,p_type,p_reason,p_amount,p_note,auth.uid()) returning * into v_row;
 return v_row;
end; $$;
revoke all on function public.create_cash_movement_atomic(uuid,uuid,date,text,text,numeric,text) from public,anon;
grant execute on function public.create_cash_movement_atomic(uuid,uuid,date,text,text,numeric,text) to authenticated;

-- Harden the internal cancellation primitive: it can only run inside a caller
-- that already owns the canonical business-day lock, never directly via PostgREST.
alter function public.cancel_order(uuid,text,text,text,boolean) rename to cancel_order_without_business_day_guard;
revoke all on function public.cancel_order_without_business_day_guard(uuid,text,text,text,boolean) from public,anon,authenticated;
alter function public.cancel_order_without_business_day_guard(uuid,text,text,text,boolean) security definer set search_path=public;

create or replace function public.cancel_order(p_order_id uuid,p_reason text,p_note text,p_cancelled_by text,p_restock boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order record; v_result jsonb; v_date date;
begin
 select * into v_order from public.orders where id=p_order_id;
 if not found or auth.uid() is null or not exists(select 1 from public.shop_members where shop_id=v_order.shop_id and user_id=auth.uid()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 v_date := (coalesce(v_order.paid_at,v_order.created_at) at time zone 'Asia/Bangkok')::date;
 perform public.assert_business_day_open(v_order.shop_id,v_order.branch_id,v_date);
 select public.cancel_order_without_business_day_guard(p_order_id,p_reason,p_note,p_cancelled_by,p_restock) into v_result;
 return v_result;
end; $$;
revoke all on function public.cancel_order(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.cancel_order(uuid,text,text,text,boolean) to authenticated;

create or replace function public.finalize_daily_close_atomic(
 p_shop_id uuid,p_branch_id uuid,p_business_date date,p_close_id uuid,p_snapshot jsonb,
 p_counted_cash numeric,p_cash_difference numeric,p_notes text
) returns public.daily_closes language plpgsql security definer set search_path=public as $$
declare v_row public.daily_closes;
begin
 if auth.uid() is null or not exists(select 1 from public.shop_members where shop_id=p_shop_id and user_id=auth.uid() and role='owner') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform public.lock_business_day(p_shop_id,p_branch_id,p_business_date);
 update public.daily_closes set status='closed', counted_cash=p_counted_cash,
  cash_difference=p_cash_difference, notes=p_notes, closed_by=auth.uid(), closed_at=now(),
  gross_sales=(p_snapshot->>'gross_sales')::numeric, net_sales=(p_snapshot->>'net_sales')::numeric,
  cash_sales=(p_snapshot->>'cash_sales')::numeric, promptpay_sales=(p_snapshot->>'promptpay_sales')::numeric,
  unknown_payment_sales=(p_snapshot->>'unknown_payment_sales')::numeric,
  paid_order_count=(p_snapshot->>'paid_order_count')::integer,
  cancelled_order_count=(p_snapshot->>'cancelled_order_count')::integer,
  refunded_order_count=(p_snapshot->>'refunded_order_count')::integer,
  void_order_count=(p_snapshot->>'void_order_count')::integer
 where id=p_close_id and shop_id=p_shop_id and branch_id=p_branch_id and business_date=p_business_date and status='draft'
 returning * into v_row;
 if not found then raise exception 'DAILY_CLOSE_NOT_DRAFT' using errcode='P0001'; end if;
 return v_row;
end; $$;
revoke all on function public.finalize_daily_close_atomic(uuid,uuid,date,uuid,jsonb,numeric,numeric,text) from public,anon;
grant execute on function public.finalize_daily_close_atomic(uuid,uuid,date,uuid,jsonb,numeric,numeric,text) to authenticated;
