--
-- PostgreSQL database dump
--

\restrict DudRVmBgse2ufWYQdJRNPg1ugbVth2RDJpmdLUbbWBTZNMEe5iplm5rOAcKR6xc

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: contact_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contact_category AS ENUM (
    'praise',
    'issue',
    'question',
    'other',
    'business',
    'complaint',
    'feedback'
);


--
-- Name: adjust_stock(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_stock(ing_id uuid, diff numeric, note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  v_before numeric;
  v_after  numeric;
begin
  if diff is null then
    raise exception 'diff is required';
  end if;

  -- lock row กัน race
  select stock
  into v_before
  from public.ingredients
  where id = ing_id
  for update;

  if not found then
    raise exception 'ingredient not found: %', ing_id;
  end if;

  v_after := v_before + diff;

  if v_after < 0 then
    raise exception 'insufficient stock (have %, diff %)', v_before, diff;
  end if;

  update public.ingredients
  set stock = v_after,
      updated_at = now()
  where id = ing_id;

  insert into public.stock_logs (
    ingredient_id,
    order_id,
    amount,
    type,
    note,
    before_stock,
    after_stock,
    created_at
  )
  values (
    ing_id,
    null,
    diff,          -- ✅ signed (+/-)
    'adjust',      -- ✅ always adjust
    note,
    v_before,
    v_after,
    now()
  );
end;
$$;


--
-- Name: apply_shop_rls(text); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.apply_shop_rls(IN p_table text)
    LANGUAGE plpgsql
    AS $_$
declare
  has_table boolean;
  has_shop_id boolean;
begin
  -- table exists?
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = p_table
  ) into has_table;

  if not has_table then
    raise exception 'table public.% does not exist', p_table;
  end if;

  -- has shop_id column?
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = 'shop_id'
  ) into has_shop_id;

  if not has_shop_id then
    raise exception 'table public.% has no shop_id column', p_table;
  end if;

  -- enable RLS
  execute format('alter table public.%I enable row level security;', p_table);

  -- SELECT (staff+owner): อ่านได้เฉพาะร้านตัวเอง
  execute format('drop policy if exists %L on public.%I;', p_table || '_select', p_table);
  execute format($sql$
    create policy %L
    on public.%I for select
    using (shop_id = public.current_shop_id());
  $sql$, p_table || '_select', p_table);

  -- INSERT (owner only)
  execute format('drop policy if exists %L on public.%I;', p_table || '_insert_owner', p_table);
  execute format($sql$
    create policy %L
    on public.%I for insert
    with check (shop_id = public.current_shop_id() and public.is_owner_in_current_shop());
  $sql$, p_table || '_insert_owner', p_table);

  -- UPDATE (owner only)
  execute format('drop policy if exists %L on public.%I;', p_table || '_update_owner', p_table);
  execute format($sql$
    create policy %L
    on public.%I for update
    using (shop_id = public.current_shop_id() and public.is_owner_in_current_shop())
    with check (shop_id = public.current_shop_id() and public.is_owner_in_current_shop());
  $sql$, p_table || '_update_owner', p_table);

  -- DELETE (owner only)
  execute format('drop policy if exists %L on public.%I;', p_table || '_delete_owner', p_table);
  execute format($sql$
    create policy %L
    on public.%I for delete
    using (shop_id = public.current_shop_id() and public.is_owner_in_current_shop());
  $sql$, p_table || '_delete_owner', p_table);

  raise notice 'OK: RLS + policies applied to public.%', p_table;
end;
$_$;


--
-- Name: block_system_menu_serve_types_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_system_menu_serve_types_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- block only true system rows
  if (coalesce(old.is_system, false) = true) or (old.system_key is not null) then
    raise exception 'system menu_serve_type is immutable';
  end if;

  if tg_op = 'UPDATE' then
    -- prevent promoting to system
    if (coalesce(new.is_system, false) = true) or (new.system_key is not null) then
      raise exception 'cannot promote menu_serve_type to system';
    end if;
    return new;
  end if;

  -- DELETE path
  return old;
end $$;


--
-- Name: cancel_order(uuid, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_order(p_order_id uuid, p_reason text, p_note text DEFAULT NULL::text, p_cancelled_by text DEFAULT NULL::text, p_restock boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    where oi.order_id = p_order_id
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
    returning u.ingredient_id, u.qty
  )
  insert into public.stock_logs (ingredient_id, order_id, amount, type, note, created_at)
  select
    a.ingredient_id,
    p_order_id,
    a.qty,
    case when p_restock then 'restock' else 'waste' end,
    case
      when p_restock then 'Order cancelled: restock'
      else 'Order cancelled: waste'
    end,
    now()
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


--
-- Name: current_branch_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_branch_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.current_branch_id', true), '')::uuid,
    (select p.current_branch_id from public.profiles p where p.id = auth.uid())
  );
$$;


--
-- Name: current_shop_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_shop_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.current_shop_id', true), '')::uuid,
    (select p.current_shop_id from public.profiles p where p.id = auth.uid())
  );
$$;


--
-- Name: deduct_stock_atomic(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deduct_stock_atomic(p_order_id uuid, p_note text, p_items jsonb) RETURNS TABLE(ingredient_id uuid, before_stock numeric, deduct numeric, after_stock numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
    rec record;
    v_before numeric;
    v_after numeric;
begin
    /*
      p_items format:
      [
        { "ingredient_id": "...uuid...", "amount": 2 },
        { "ingredient_id": "...uuid...", "amount": 5 }
      ]
    */

    for rec in
        select
            (x->>'ingredient_id')::uuid as ingredient_id,
            abs((x->>'amount')::numeric) as deduct
        from jsonb_array_elements(p_items) x
    loop
        -- lock ingredient row
        select stock
        into v_before
        from public.ingredients
        where id = rec.ingredient_id
        for update;

        if not found then
            raise exception 'Ingredient not found: %', rec.ingredient_id;
        end if;

        v_after := v_before - rec.deduct;

        if v_after < 0 then
            raise exception
                'Insufficient stock for ingredient % (need %, have %)',
                rec.ingredient_id, rec.deduct, v_before;
        end if;

        -- update stock
        update public.ingredients
        set stock = v_after
        where id = rec.ingredient_id;

        -- insert stock log (amount = NEGATIVE)
        insert into public.stock_logs (
            ingredient_id,
            order_id,
            amount,
            type,
            note,
            before_stock,
            after_stock,
            created_at
        ) values (
            rec.ingredient_id,
            p_order_id,
            -rec.deduct,
            'deduct',
            p_note,
            v_before,
            v_after,
            now()
        );

        -- return row (deduct เป็นบวก)
        ingredient_id := rec.ingredient_id;
        before_stock  := v_before;
        deduct        := rec.deduct;
        after_stock   := v_after;
        return next;
    end loop;

    return;
end;
$$;


--
-- Name: discard_ingredient_lot(uuid, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.discard_ingredient_lot(p_lot_id uuid, p_qty numeric, p_reason text, p_notes text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_lot public.ingredient_lots;
begin
  select * into v_lot
  from public.ingredient_lots
  where id = p_lot_id
  for update;

  if not found then
    raise exception 'Lot not found';
  end if;

  if p_qty <= 0 then
    raise exception 'Discard qty must be > 0';
  end if;

  if p_qty > v_lot.qty_remaining then
    raise exception 'Discard qty exceeds remaining qty';
  end if;

  update public.ingredient_lots
  set qty_remaining = qty_remaining - p_qty,
      status = case
        when qty_remaining - p_qty <= 0 then 'discarded'
        else status
      end,
      updated_at = now()
  where id = p_lot_id;

  insert into public.waste_logs (
    shop_id,
    branch_id,
    ingredient_id,
    ingredient_lot_id,
    qty,
    unit,
    reason,
    estimated_cost,
    notes,
    created_by
  )
  values (
    v_lot.shop_id,
    v_lot.branch_id,
    v_lot.ingredient_id,
    v_lot.id,
    p_qty,
    v_lot.unit,
    p_reason,
    p_qty * coalesce(v_lot.cost_per_unit, 0),
    p_notes,
    auth.uid()
  );

  insert into public.stock_logs (
    order_id,
    ingredient_id,
    amount,
    created_at,
    type,
    note,
    before_stock,
    after_stock,
    shop_id,
    branch_id,
    ingredient_lot_id,
    movement_type,
    reference_type,
    expires_at,
    opened_at
  )
  values (
    null,
    v_lot.ingredient_id,
    p_qty,
    now(),
    'discard',
    coalesce(p_notes, 'Discarded ingredient lot'),
    null,
    null,
    v_lot.shop_id,
    v_lot.branch_id,
    v_lot.id,
    'waste_discard',
    'waste',
    v_lot.expires_at,
    v_lot.opened_at
  );
end;
$$;


--
-- Name: ensure_default_branch_for_new_shop(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_default_branch_for_new_shop() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if not exists (
    select 1
    from public.branch b
    where b.shop_id = new.id
  ) then
    insert into public.branch (shop_id, name, is_primary, address)
    values (new.id, 'Main Branch', true, null);
  end if;

  return new;
end;
$$;


--
-- Name: ensure_default_serve_type(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_default_serve_type(p_shop_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.menu_serve_types (shop_id, name, is_system, system_key)
  values (p_shop_id, 'Default', true, 'default')
  on conflict (shop_id, system_key) do nothing;
end;
$$;


--
-- Name: get_expiry_alert_summary(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_expiry_alert_summary(p_shop_id uuid, p_branch_id uuid DEFAULT NULL::uuid) RETURNS TABLE(expired_count bigint, critical_count bigint, near_expiry_count bigint, risk_value numeric)
    LANGUAGE sql STABLE
    AS $$
  select
    count(*) filter (where computed_status = 'expired') as expired_count,
    count(*) filter (where computed_status = 'critical') as critical_count,
    count(*) filter (where computed_status = 'near_expiry') as near_expiry_count,
    coalesce(sum(
      case
        when computed_status in ('expired', 'critical', 'near_expiry')
          then qty_remaining * coalesce(cost_per_unit, 0)
        else 0
      end
    ), 0) as risk_value
  from public.ingredient_lot_expiry_status
  where shop_id = p_shop_id
    and (p_branch_id is null or branch_id = p_branch_id)
    and qty_remaining > 0;
$$;


--
-- Name: increment_stock(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_stock(ing_id uuid, diff numeric) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
declare
    new_value numeric;
begin
    update ingredients
    set stock = stock + diff
    where id = ing_id
    returning stock into new_value;

    return new_value;
end;
$$;


--
-- Name: ingredients_set_name_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ingredients_set_name_key() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.name_key := lower(regexp_replace(trim(new.name), '\s+', ' ', 'g'));
  return new;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.is_admin = true
  );
$$;


--
-- Name: is_owner_in_current_shop(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_owner_in_current_shop() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.shop_members sm
    where sm.user_id = auth.uid()
      and sm.shop_id = current_shop_id()
      and sm.role = 'owner'
  );
$$;


--
-- Name: is_shop_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_shop_member(p_shop_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select auth.uid() is not null and exists (
    select 1
    from public.shop_members sm
    where sm.user_id = auth.uid()
      and sm.shop_id = p_shop_id
  );
$$;


--
-- Name: is_shop_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_shop_owner(p_shop_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select auth.uid() is not null and exists (
    select 1
    from public.shop_members sm
    where sm.user_id = auth.uid()
      and sm.shop_id = p_shop_id
      and sm.role = 'owner'
  );
$$;


--
-- Name: is_staff_in_current_shop(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff_in_current_shop() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.shop_members sm
    where sm.user_id = auth.uid()
      and sm.shop_id = current_shop_id()
      and sm.role in ('owner', 'staff')
  );
$$;


--
-- Name: log_stock_add(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_stock_add() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into public.stock_logs (
    ingredient_id,
    amount,
    type,
    note,
    created_at
  )
  values (
    new.id,
    new.stock,
    'add',
    'Add ingredient',
    now()
  );

  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ingredient_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredient_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    lot_code text,
    supplier_name text,
    invoice_ref text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    opened_at timestamp with time zone,
    manufactured_at date,
    expires_at date,
    best_before_at date,
    qty_received numeric(14,3) NOT NULL,
    qty_remaining numeric(14,3) NOT NULL,
    unit text NOT NULL,
    cost_per_unit numeric(12,2),
    status text DEFAULT 'active'::text NOT NULL,
    source_type text DEFAULT 'purchase'::text NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ingredient_lots_check CHECK ((qty_remaining <= qty_received)),
    CONSTRAINT ingredient_lots_cost_per_unit_check CHECK (((cost_per_unit IS NULL) OR (cost_per_unit >= (0)::numeric))),
    CONSTRAINT ingredient_lots_qty_received_check CHECK ((qty_received >= (0)::numeric)),
    CONSTRAINT ingredient_lots_qty_remaining_check CHECK ((qty_remaining >= (0)::numeric)),
    CONSTRAINT ingredient_lots_source_type_check CHECK ((source_type = ANY (ARRAY['purchase'::text, 'manual'::text, 'transfer_in'::text, 'production'::text, 'adjustment'::text]))),
    CONSTRAINT ingredient_lots_status_check CHECK ((status = ANY (ARRAY['active'::text, 'near_expiry'::text, 'critical'::text, 'expired'::text, 'depleted'::text, 'discarded'::text])))
);


--
-- Name: mark_ingredient_lot_opened(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_ingredient_lot_opened(p_lot_id uuid) RETURNS public.ingredient_lots
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_row public.ingredient_lots;
begin
  update public.ingredient_lots
  set opened_at = coalesce(opened_at, now()),
      updated_at = now()
  where id = p_lot_id
  returning * into v_row;

  return v_row;
end;
$$;


--
-- Name: prevent_delete_last_branch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_delete_last_branch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if old.shop_id is null then
    return old;
  end if;

  if not exists (
    select 1
    from public.branch b
    where b.shop_id = old.shop_id
      and b.id <> old.id
  ) then
    raise exception 'At least one branch is required per shop'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;


--
-- Name: process_pos_checkout(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_pos_checkout(p_items jsonb, p_branch_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_order_id uuid;
  v_total numeric;
  v_bad int;
  v_missing_variant int;
  v_missing_recipe int;
  v_not_enough int;
begin
  -- p_items must be array
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be json array';
  end if;

  -- validate each item
  select count(*) into v_bad
  from jsonb_array_elements(p_items) x
  where (x->>'variant_id') is null
     or (x->>'qty') is null
     or (x->>'qty')::int <= 0;

  if v_bad > 0 then
    raise exception 'invalid items: variant_id/qty';
  end if;

  -- validate variants exist
  select count(*) into v_missing_variant
  from jsonb_array_elements(p_items) x
  left join public.menu_variants mv on mv.id = (x->>'variant_id')::uuid
  where mv.id is null;

  if v_missing_variant > 0 then
    raise exception 'variant not found';
  end if;

  -- validate recipe exists (>=1 row per variant)
  select count(*) into v_missing_recipe
  from (
    select (x->>'variant_id')::uuid as variant_id
    from jsonb_array_elements(p_items) x
    group by 1
  ) t
  left join lateral (
    select 1
    from public.recipe_items ri
    where ri.variant_id = t.variant_id
    limit 1
  ) r on true
  where r is null;

  if v_missing_recipe > 0 then
    raise exception 'no recipe for some variant';
  end if;

  -- lock all involved ingredients rows (prevents race / double checkout)
  perform 1
  from public.ingredients i
  where i.id in (
    select distinct ri.ingredient_id
    from public.recipe_items ri
    where ri.variant_id in (
      select (x->>'variant_id')::uuid
      from jsonb_array_elements(p_items) x
    )
  )
  for update;

  -- check stock enough (aggregate needed)
  with items as (
    select
      (x->>'variant_id')::uuid as variant_id,
      (x->>'qty')::int as qty
    from jsonb_array_elements(p_items) x
  ),
  req as (
    select
      ri.ingredient_id,
      sum(ri.quantity * it.qty)::numeric as required_qty
    from items it
    join public.recipe_items ri on ri.variant_id = it.variant_id
    group by ri.ingredient_id
  )
  select count(*) into v_not_enough
  from req
  join public.ingredients i on i.id = req.ingredient_id
  where i.stock < req.required_qty;

  if v_not_enough > 0 then
    raise exception 'not enough stock';
  end if;

  -- compute total (price_override else menu.price)
  with items as (
    select
      (x->>'variant_id')::uuid as variant_id,
      (x->>'qty')::int as qty
    from jsonb_array_elements(p_items) x
  )
  select coalesce(sum(coalesce(mv.price_override, m.price) * it.qty), 0)
  into v_total
  from items it
  join public.menu_variants mv on mv.id = it.variant_id
  join public.menu m on m.id = mv.menu_id;

  -- create order (POS: success immediately)
  -- NOTE: orders has no branch_id column (in your DDL), so we don't set it.
  -- If you later add branch_id, add it here.
  insert into public.orders (total, status, payment_method, paid_at)
  values (v_total, 'paid', 'cash', now())
  returning id into v_order_id;

  -- insert order_items (include variant_label snapshot)
  with items as (
    select
      (x->>'variant_id')::uuid as variant_id,
      (x->>'qty')::int as qty
    from jsonb_array_elements(p_items) x
  )
  insert into public.order_items (
    order_id, menu_id, variant_id, name, price, qty, variant_label
  )
  select
    v_order_id,
    mv.menu_id,
    mv.id,
    m.name,
    coalesce(mv.price_override, m.price) as price,
    it.qty,
    case
      when mst.name is null then null
      else
        case
          when coalesce(nullif(btrim(mv.size), ''), 'default') = 'default'
            then mst.name
          else mst.name || ' • ' || mv.size
        end
    end as variant_label
  from items it
  join public.menu_variants mv on mv.id = it.variant_id
  join public.menu m on m.id = mv.menu_id
  left join public.menu_serve_types mst on mst.id = mv.serve_type_id;

  -- deduct stock + insert stock_logs with before/after
  with items as (
    select
      (x->>'variant_id')::uuid as variant_id,
      (x->>'qty')::int as qty
    from jsonb_array_elements(p_items) x
  ),
  req as (
    select
      ri.ingredient_id,
      sum(ri.quantity * it.qty)::numeric as required_qty
    from items it
    join public.recipe_items ri on ri.variant_id = it.variant_id
    group by ri.ingredient_id
  ),
  upd as (
    update public.ingredients i
    set stock = i.stock - req.required_qty,
        updated_at = now()
    from req
    where i.id = req.ingredient_id
    returning
      i.id as ingredient_id,
      (i.stock + req.required_qty) as before_stock,
      i.stock as after_stock,
      req.required_qty as deduct_qty
  )
  insert into public.stock_logs (
    order_id, ingredient_id, amount, type, note, before_stock, after_stock
  )
  select
    v_order_id,
    u.ingredient_id,
    u.deduct_qty,
    'deduct',
    'POS checkout',
    u.before_stock,
    u.after_stock
  from upd u;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'total', v_total
  );
end;
$$;


--
-- Name: revenue_summary_range(timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revenue_summary_range(p_start timestamp with time zone, p_end timestamp with time zone, p_by text DEFAULT 'paid_at'::text) RETURNS TABLE(total numeric, count bigint)
    LANGUAGE sql STABLE
    AS $$
  select
    coalesce(sum(o.total), 0) as total,
    count(*) as count
  from public.orders o
  where o.status = 'paid'
    and (
      case
        when p_by = 'created_at' then o.created_at
        else coalesce(o.paid_at, o.created_at)
      end
    ) >= p_start
    and (
      case
        when p_by = 'created_at' then o.created_at
        else coalesce(o.paid_at, o.created_at)
      end
    ) < p_end;
$$;


--
-- Name: set_current_context(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_current_context(p_shop_id uuid, p_branch_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  -- must be member of shop
  if not exists (
    select 1 from public.shop_members sm
    where sm.user_id = auth.uid()
      and sm.shop_id = p_shop_id
  ) then
    raise exception 'not a member of this shop';
  end if;

  -- branch must belong to shop (if provided)
  if p_branch_id is not null then
    if not exists (
      select 1 from public.branch b
      where b.id = p_branch_id
        and b.shop_id = p_shop_id
    ) then
      raise exception 'branch not in shop';
    end if;
  end if;

  update public.profiles
  set current_shop_id = p_shop_id,
      current_branch_id = p_branch_id
  where id = auth.uid();
end;
$$;


--
-- Name: set_current_shop(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_current_shop(p_shop_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.shop_members
    where user_id = auth.uid()
      and shop_id = p_shop_id
  ) then
    raise exception 'not a member of this shop';
  end if;

  update public.profiles
  set current_shop_id = p_shop_id
  where id = auth.uid();

  return true;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: sync_order_items_shop_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_order_items_shop_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  select o.shop_id into new.shop_id
  from public.orders o
  where o.id = new.order_id;

  if new.shop_id is null then
    raise exception 'order_items.order_id not found in orders';
  end if;

  return new;
end;
$$;


--
-- Name: tg_menu_variants_prevent_default_loss(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_menu_variants_prevent_default_loss() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- ✅ Allow cascade/trigger-chain deletes (e.g. deleting parent menu)
  -- When parent menu is deleted, Postgres cascades delete to menu_variants.
  -- That delete happens inside a trigger context -> pg_trigger_depth() > 0
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 0 then
      return old;
    end if;

    -- ✅ Block deleting the last default variant ONLY for direct deletes
    if old.is_default = true then
      if not exists (
        select 1
        from public.menu_variants mv
        where mv.menu_id = old.menu_id
          and mv.serve_type_id = old.serve_type_id
          and mv.id <> old.id
          and mv.is_default = true
      ) then
        raise exception
          'Cannot delete the last default variant for menu_id=% serve_type_id=%',
          old.menu_id, old.serve_type_id;
      end if;
    end if;

    return old;
  end if;

  return new;
end;
$$;


--
-- Name: tg_menu_variants_single_default(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_menu_variants_single_default() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- ✅ ถ้าเป็น delete ที่มาจาก cascade/trigger chain (ไม่ได้ลบ variant ตรงๆจาก UI)
  -- ปล่อยผ่าน ไม่ต้อง enforce "ต้องมี default เหลือ"
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 0 then
      return old;
    end if;

    -- กันลบ default ตัวสุดท้าย เฉพาะ "ลบตรงๆ"
    if old.is_default = true then
      if not exists (
        select 1
        from public.menu_variants mv
        where mv.menu_id = old.menu_id
          and mv.serve_type_id = old.serve_type_id
          and mv.id <> old.id
          and mv.is_default = true
      ) then
        raise exception 'Cannot delete the last default variant for menu_id=% serve_type_id=%',
          old.menu_id, old.serve_type_id;
      end if;
    end if;

    return old;
  end if;

  -- ✅ enforce single default on insert/update
  if new.is_default = true then
    update public.menu_variants
    set is_default = false
    where menu_id = new.menu_id
      and serve_type_id = new.serve_type_id
      and id <> new.id;
  end if;

  return new;
end;
$$;


--
-- Name: _backup_shopa_mismatch_ingredient_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._backup_shopa_mismatch_ingredient_logs (
    id uuid,
    order_id uuid,
    ingredient_id uuid,
    amount numeric,
    created_at timestamp with time zone,
    type text,
    note text,
    before_stock numeric,
    after_stock numeric,
    shop_id uuid,
    branch_id uuid
);


--
-- Name: _backup_stock_logs_shopa_before_fix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._backup_stock_logs_shopa_before_fix (
    id uuid,
    order_id uuid,
    ingredient_id uuid,
    amount numeric,
    created_at timestamp with time zone,
    type text,
    note text,
    before_stock numeric,
    after_stock numeric,
    shop_id uuid,
    branch_id uuid
);


--
-- Name: branch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    map_url text,
    created_at timestamp without time zone,
    opening_hours text,
    is_primary boolean DEFAULT false,
    shop_id uuid DEFAULT public.current_shop_id()
);


--
-- Name: branch_menu_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_menu_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    menu_id uuid NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cash_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    type text NOT NULL,
    reason text NOT NULL,
    amount numeric NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_movements_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT cash_movements_reason_check CHECK ((reason = ANY (ARRAY['เติมเงินทอน'::text, 'เงินคืน / รับเงินสดอื่น'::text, 'ซื้อวัตถุดิบเข้าร้าน'::text, 'ซื้อบรรจุภัณฑ์ / ของใช้ร้าน'::text, 'ค่าใช้จ่ายร้าน'::text, 'ฝากธนาคาร'::text, 'เจ้าของถอนเงิน'::text, 'ปรับยอดเงินสด'::text, 'ซื้อของเข้าร้าน'::text, 'เบิกเงินสด'::text]))),
    CONSTRAINT cash_movements_type_check CHECK ((type = ANY (ARRAY['cash_in'::text, 'cash_out'::text])))
);


--
-- Name: contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    message text,
    created_at timestamp with time zone DEFAULT now(),
    category public.contact_category DEFAULT 'other'::public.contact_category NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: daily_closes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_closes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    opening_cash_float numeric DEFAULT 0 NOT NULL,
    counted_cash numeric,
    expected_cash numeric DEFAULT 0 NOT NULL,
    cash_difference numeric,
    gross_sales numeric DEFAULT 0 NOT NULL,
    net_sales numeric DEFAULT 0 NOT NULL,
    cash_sales numeric DEFAULT 0 NOT NULL,
    promptpay_sales numeric DEFAULT 0 NOT NULL,
    unknown_payment_sales numeric DEFAULT 0 NOT NULL,
    paid_order_count integer DEFAULT 0 NOT NULL,
    cancelled_order_count integer DEFAULT 0 NOT NULL,
    refunded_order_count integer DEFAULT 0 NOT NULL,
    void_order_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_closes_approve_requirements CHECK (((status <> 'approved'::text) OR ((status = 'approved'::text) AND (approved_at IS NOT NULL) AND (approved_by IS NOT NULL)))),
    CONSTRAINT daily_closes_close_requirements CHECK (((status = 'draft'::text) OR ((status = ANY (ARRAY['closed'::text, 'approved'::text])) AND (counted_cash IS NOT NULL) AND (closed_at IS NOT NULL) AND (closed_by IS NOT NULL)))),
    CONSTRAINT daily_closes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'closed'::text, 'approved'::text])))
);


--
-- Name: hero; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hero (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    subtitle text NOT NULL,
    cta_text text NOT NULL,
    cta_link text NOT NULL,
    secondary_text text NOT NULL,
    secondary_link text NOT NULL,
    signature text NOT NULL,
    seasonal text NOT NULL,
    image_url text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id()
);


--
-- Name: ingredient_expiry_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredient_expiry_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    tracking_mode text DEFAULT 'none'::text NOT NULL,
    shelf_life_days integer,
    after_open_days integer,
    near_expiry_days integer DEFAULT 3 NOT NULL,
    critical_expiry_days integer DEFAULT 1 NOT NULL,
    alert_enabled boolean DEFAULT true NOT NULL,
    sale_block_mode text DEFAULT 'warn_only'::text NOT NULL,
    waste_action_hint text DEFAULT 'use_first'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ingredient_expiry_settings_after_open_days_check CHECK (((after_open_days IS NULL) OR (after_open_days >= 0))),
    CONSTRAINT ingredient_expiry_settings_critical_expiry_days_check CHECK ((critical_expiry_days >= 0)),
    CONSTRAINT ingredient_expiry_settings_near_expiry_days_check CHECK ((near_expiry_days >= 0)),
    CONSTRAINT ingredient_expiry_settings_sale_block_mode_check CHECK ((sale_block_mode = ANY (ARRAY['warn_only'::text, 'soft_block'::text, 'hard_block'::text]))),
    CONSTRAINT ingredient_expiry_settings_shelf_life_days_check CHECK (((shelf_life_days IS NULL) OR (shelf_life_days >= 0))),
    CONSTRAINT ingredient_expiry_settings_tracking_mode_check CHECK ((tracking_mode = ANY (ARRAY['none'::text, 'expiry_date'::text, 'open_date'::text, 'both'::text]))),
    CONSTRAINT ingredient_expiry_settings_waste_action_hint_check CHECK ((waste_action_hint = ANY (ARRAY['use_first'::text, 'promo'::text, 'transfer'::text, 'discard'::text])))
);


--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    stock numeric DEFAULT 0 NOT NULL,
    unit text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    category text,
    cost_per_unit numeric,
    base_unit text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    archived_at timestamp with time zone,
    name_key text,
    min_stock numeric DEFAULT 0 NOT NULL,
    low_stock_days integer DEFAULT 3 NOT NULL,
    warn_stock_days integer DEFAULT 7 NOT NULL,
    lead_time_days integer DEFAULT 2 NOT NULL,
    safety_stock_qty numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL,
    branch_id uuid,
    track_lots boolean DEFAULT false NOT NULL,
    expiry_tracking_enabled boolean DEFAULT false NOT NULL,
    default_shelf_life_days integer,
    default_after_open_days integer,
    default_near_expiry_days integer DEFAULT 3 NOT NULL,
    default_critical_expiry_days integer DEFAULT 1 NOT NULL,
    waste_cost_per_unit numeric(12,2),
    CONSTRAINT ingredients_base_unit_check CHECK ((base_unit = ANY (ARRAY['ml'::text, 'g'::text, 'piece'::text]))),
    CONSTRAINT ingredients_lead_time_days_chk CHECK ((lead_time_days >= 0)),
    CONSTRAINT ingredients_low_stock_days_chk CHECK ((low_stock_days >= 0)),
    CONSTRAINT ingredients_min_stock_nonneg CHECK ((min_stock >= (0)::numeric)),
    CONSTRAINT ingredients_warn_ge_low_chk CHECK ((warn_stock_days >= low_stock_days)),
    CONSTRAINT ingredients_warn_stock_days_chk CHECK ((warn_stock_days >= 0))
);


--
-- Name: ingredient_lot_expiry_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ingredient_lot_expiry_status AS
 SELECT il.id,
    il.shop_id,
    il.branch_id,
    il.ingredient_id,
    i.name AS ingredient_name,
    il.lot_code,
    il.received_at,
    il.opened_at,
    il.manufactured_at,
    il.expires_at,
    il.best_before_at,
    il.qty_received,
    il.qty_remaining,
    il.unit,
    il.cost_per_unit,
    il.status AS stored_status,
    il.source_type,
    il.notes,
    il.created_at,
    il.updated_at,
    ies.tracking_mode,
    ies.shelf_life_days,
    ies.after_open_days,
    ies.near_expiry_days,
    ies.critical_expiry_days,
    ies.alert_enabled,
    ies.sale_block_mode,
    ies.waste_action_hint,
        CASE
            WHEN (il.expires_at IS NOT NULL) THEN (il.expires_at)::timestamp with time zone
            WHEN ((il.opened_at IS NOT NULL) AND (ies.after_open_days IS NOT NULL)) THEN (il.opened_at + make_interval(days => ies.after_open_days))
            WHEN (ies.shelf_life_days IS NOT NULL) THEN (il.received_at + make_interval(days => ies.shelf_life_days))
            ELSE NULL::timestamp with time zone
        END AS effective_expiry_at,
        CASE
            WHEN (
            CASE
                WHEN (il.expires_at IS NOT NULL) THEN (il.expires_at)::timestamp with time zone
                WHEN ((il.opened_at IS NOT NULL) AND (ies.after_open_days IS NOT NULL)) THEN (il.opened_at + make_interval(days => ies.after_open_days))
                WHEN (ies.shelf_life_days IS NOT NULL) THEN (il.received_at + make_interval(days => ies.shelf_life_days))
                ELSE NULL::timestamp with time zone
            END IS NULL) THEN NULL::integer
            ELSE (floor((EXTRACT(epoch FROM (
            CASE
                WHEN (il.expires_at IS NOT NULL) THEN (il.expires_at)::timestamp with time zone
                WHEN ((il.opened_at IS NOT NULL) AND (ies.after_open_days IS NOT NULL)) THEN (il.opened_at + make_interval(days => ies.after_open_days))
                WHEN (ies.shelf_life_days IS NOT NULL) THEN (il.received_at + make_interval(days => ies.shelf_life_days))
                ELSE NULL::timestamp with time zone
            END - now())) / (86400)::numeric)))::integer
        END AS days_to_expiry,
        CASE
            WHEN (il.qty_remaining <= (0)::numeric) THEN 'depleted'::text
            WHEN (
            CASE
                WHEN (il.expires_at IS NOT NULL) THEN (il.expires_at)::timestamp with time zone
                WHEN ((il.opened_at IS NOT NULL) AND (ies.after_open_days IS NOT NULL)) THEN (il.opened_at + make_interval(days => ies.after_open_days))
                WHEN (ies.shelf_life_days IS NOT NULL) THEN (il.received_at + make_interval(days => ies.shelf_life_days))
                ELSE NULL::timestamp with time zone
            END IS NULL) THEN 'active'::text
            WHEN (
            CASE
                WHEN (il.expires_at IS NOT NULL) THEN (il.expires_at)::timestamp with time zone
                WHEN ((il.opened_at IS NOT NULL) AND (ies.after_open_days IS NOT NULL)) THEN (il.opened_at + make_interval(days => ies.after_open_days))
                WHEN (ies.shelf_life_days IS NOT NULL) THEN (il.received_at + make_interval(days => ies.shelf_life_days))
                ELSE NULL::timestamp with time zone
            END < now()) THEN 'expired'::text
            WHEN (
            CASE
                WHEN (il.expires_at IS NOT NULL) THEN (il.expires_at)::timestamp with time zone
                WHEN ((il.opened_at IS NOT NULL) AND (ies.after_open_days IS NOT NULL)) THEN (il.opened_at + make_interval(days => ies.after_open_days))
                WHEN (ies.shelf_life_days IS NOT NULL) THEN (il.received_at + make_interval(days => ies.shelf_life_days))
                ELSE NULL::timestamp with time zone
            END <= (now() + make_interval(days => COALESCE(ies.critical_expiry_days, 1)))) THEN 'critical'::text
            WHEN (
            CASE
                WHEN (il.expires_at IS NOT NULL) THEN (il.expires_at)::timestamp with time zone
                WHEN ((il.opened_at IS NOT NULL) AND (ies.after_open_days IS NOT NULL)) THEN (il.opened_at + make_interval(days => ies.after_open_days))
                WHEN (ies.shelf_life_days IS NOT NULL) THEN (il.received_at + make_interval(days => ies.shelf_life_days))
                ELSE NULL::timestamp with time zone
            END <= (now() + make_interval(days => COALESCE(ies.near_expiry_days, 3)))) THEN 'near_expiry'::text
            ELSE 'active'::text
        END AS computed_status
   FROM ((public.ingredient_lots il
     JOIN public.ingredients i ON ((i.id = il.ingredient_id)))
     LEFT JOIN public.ingredient_expiry_settings ies ON (((ies.shop_id = il.shop_id) AND (ies.ingredient_id = il.ingredient_id))));


--
-- Name: ingredient_expiry_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ingredient_expiry_summary AS
 SELECT shop_id,
    branch_id,
    ingredient_id,
    ingredient_name,
    sum(qty_remaining) AS total_qty_remaining,
    min(effective_expiry_at) AS nearest_expiry_at,
    min(days_to_expiry) AS nearest_days_to_expiry,
        CASE
            WHEN bool_or((computed_status = 'expired'::text)) THEN 'expired'::text
            WHEN bool_or((computed_status = 'critical'::text)) THEN 'critical'::text
            WHEN bool_or((computed_status = 'near_expiry'::text)) THEN 'near_expiry'::text
            ELSE 'active'::text
        END AS summary_status,
    count(*) FILTER (WHERE (qty_remaining > (0)::numeric)) AS active_lot_count,
    COALESCE(sum(
        CASE
            WHEN (computed_status = ANY (ARRAY['expired'::text, 'critical'::text, 'near_expiry'::text])) THEN (qty_remaining * COALESCE(cost_per_unit, (0)::numeric))
            ELSE (0)::numeric
        END), (0)::numeric) AS risk_value
   FROM public.ingredient_lot_expiry_status v
  WHERE (qty_remaining > (0)::numeric)
  GROUP BY shop_id, branch_id, ingredient_id, ingredient_name;


--
-- Name: menu; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    price numeric NOT NULL,
    image_url text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    category_id uuid NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: menu_serve_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_serve_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    system_key text,
    CONSTRAINT menu_serve_types_no_default_name_for_user CHECK (((is_system = true) OR (lower(btrim(name)) <> 'default'::text))),
    CONSTRAINT menu_serve_types_no_default_system_key CHECK (((system_key IS NULL) OR (system_key <> 'default'::text))),
    CONSTRAINT menu_serve_types_system_key_guard CHECK ((((is_system = false) AND (system_key IS NULL)) OR ((is_system = true) AND (system_key IS NOT NULL))))
);


--
-- Name: menu_serves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_serves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_id uuid NOT NULL,
    serve_type_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: menu_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_id uuid NOT NULL,
    serve_type_id uuid NOT NULL,
    size text DEFAULT 'default'::text NOT NULL,
    price_override numeric,
    image_url text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: news; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    content text,
    image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_date timestamp with time zone NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    menu_id uuid,
    name text NOT NULL,
    price numeric NOT NULL,
    qty integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid,
    variant_label text,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    total numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'paid'::text NOT NULL,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    paid_at timestamp with time zone,
    note text,
    cancel_reason text,
    cancel_note text,
    cancelled_at timestamp with time zone,
    cancelled_by text,
    stock_refunded boolean DEFAULT false NOT NULL,
    stock_refunded_at timestamp with time zone,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL,
    branch_id uuid DEFAULT public.current_branch_id() NOT NULL,
    paid_amount numeric(10,2),
    change_amount numeric(10,2),
    CONSTRAINT orders_change_amount_non_negative CHECK (((change_amount IS NULL) OR (change_amount >= (0)::numeric))),
    CONSTRAINT orders_paid_amount_non_negative CHECK (((paid_amount IS NULL) OR (paid_amount >= (0)::numeric))),
    CONSTRAINT orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'promptpay'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'cancelled'::text, 'void'::text, 'refunded'::text])))
);


--
-- Name: pos_idempotency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_idempotency (
    key text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    role text NOT NULL,
    current_shop_id uuid,
    current_branch_id uuid,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'staff'::text])))
);


--
-- Name: recipe_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    quantity numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    quantity numeric NOT NULL,
    shop_id uuid DEFAULT public.current_shop_id() NOT NULL
);


--
-- Name: shop_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_members (
    shop_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'staff'::text])))
);


--
-- Name: shops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text NOT NULL,
    tax_id text,
    receipt_footer text,
    CONSTRAINT shops_slug_format_chk CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text))
);


--
-- Name: stock_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    ingredient_id uuid NOT NULL,
    amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    type text DEFAULT 'deduct'::text,
    note text,
    before_stock numeric,
    after_stock numeric,
    shop_id uuid DEFAULT public.current_shop_id(),
    branch_id uuid DEFAULT public.current_branch_id(),
    ingredient_lot_id uuid,
    movement_type text,
    reference_type text,
    reference_id uuid,
    expires_at date,
    opened_at timestamp with time zone,
    CONSTRAINT stock_logs_amount_nonneg CHECK ((amount >= (0)::numeric)),
    CONSTRAINT stock_logs_amount_positive CHECK ((amount >= (0)::numeric))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: v_ingredients_alert; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ingredients_alert AS
 WITH usage_14 AS (
         SELECT l.ingredient_id,
            sum(abs(l.amount)) AS used_14
           FROM public.stock_logs l
          WHERE ((l.created_at >= (now() - '14 days'::interval)) AND (l.type = ANY (ARRAY['deduct'::text, 'decrease'::text, 'loss'::text])))
          GROUP BY l.ingredient_id
        )
 SELECT i.id,
    i.name,
    i.stock,
    i.unit,
    i.category,
    i.min_stock,
    i.low_stock_days,
    i.warn_stock_days,
    i.lead_time_days,
    i.safety_stock_qty,
    i.is_active,
    i.archived_at,
    (COALESCE(u.used_14, (0)::numeric) / 14.0) AS used_per_day,
        CASE
            WHEN (COALESCE(u.used_14, (0)::numeric) = (0)::numeric) THEN NULL::numeric
            ELSE (i.stock / NULLIF((COALESCE(u.used_14, (0)::numeric) / 14.0), (0)::numeric))
        END AS days_left_est,
        CASE
            WHEN ((i.is_active IS FALSE) OR (i.archived_at IS NOT NULL)) THEN 'inactive'::text
            WHEN ((i.min_stock IS NOT NULL) AND (i.stock <= i.min_stock)) THEN 'low'::text
            WHEN (COALESCE(u.used_14, (0)::numeric) = (0)::numeric) THEN 'no_usage'::text
            WHEN ((i.stock / NULLIF((COALESCE(u.used_14, (0)::numeric) / 14.0), (0)::numeric)) <= (i.low_stock_days)::numeric) THEN 'low'::text
            WHEN ((i.stock / NULLIF((COALESCE(u.used_14, (0)::numeric) / 14.0), (0)::numeric)) <= (i.warn_stock_days)::numeric) THEN 'warn'::text
            ELSE 'ok'::text
        END AS stock_status
   FROM (public.ingredients i
     LEFT JOIN usage_14 u ON ((u.ingredient_id = i.id)));


--
-- Name: v_user_shop_permissions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_user_shop_permissions AS
 SELECT au.id AS user_id,
    au.email,
    sm.shop_id,
    s.name AS shop_name,
    sm.role,
    (sm.role = 'owner'::text) AS can_manage_billing,
    (sm.role = ANY (ARRAY['owner'::text, 'manager'::text])) AS can_manage_menu,
    (sm.role = ANY (ARRAY['owner'::text, 'manager'::text])) AS can_manage_staff,
    (sm.role = ANY (ARRAY['owner'::text, 'manager'::text, 'staff'::text])) AS can_use_pos
   FROM ((public.shop_members sm
     JOIN public.shops s ON ((s.id = sm.shop_id)))
     JOIN auth.users au ON ((au.id = sm.user_id)));


--
-- Name: waste_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waste_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    ingredient_lot_id uuid,
    qty numeric(14,3) NOT NULL,
    unit text NOT NULL,
    reason text NOT NULL,
    estimated_cost numeric(12,2),
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT waste_logs_estimated_cost_check CHECK (((estimated_cost IS NULL) OR (estimated_cost >= (0)::numeric))),
    CONSTRAINT waste_logs_qty_check CHECK ((qty > (0)::numeric)),
    CONSTRAINT waste_logs_reason_check CHECK ((reason = ANY (ARRAY['expired'::text, 'spoiled'::text, 'damaged'::text, 'contaminated'::text, 'manual_adjustment'::text, 'other'::text])))
);


--
-- Name: branch_menu_availability branch_menu_availability_branch_id_menu_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_availability
    ADD CONSTRAINT branch_menu_availability_branch_id_menu_id_key UNIQUE (branch_id, menu_id);


--
-- Name: branch_menu_availability branch_menu_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_availability
    ADD CONSTRAINT branch_menu_availability_pkey PRIMARY KEY (id);


--
-- Name: branch branch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch
    ADD CONSTRAINT branch_pkey PRIMARY KEY (id);


--
-- Name: cash_movements cash_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id);


--
-- Name: contact contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_pkey PRIMARY KEY (id);


--
-- Name: daily_closes daily_closes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_closes
    ADD CONSTRAINT daily_closes_pkey PRIMARY KEY (id);


--
-- Name: daily_closes daily_closes_shop_id_branch_id_business_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_closes
    ADD CONSTRAINT daily_closes_shop_id_branch_id_business_date_key UNIQUE (shop_id, branch_id, business_date);


--
-- Name: hero hero_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hero
    ADD CONSTRAINT hero_pkey PRIMARY KEY (id);


--
-- Name: ingredient_expiry_settings ingredient_expiry_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_expiry_settings
    ADD CONSTRAINT ingredient_expiry_settings_pkey PRIMARY KEY (id);


--
-- Name: ingredient_expiry_settings ingredient_expiry_settings_shop_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_expiry_settings
    ADD CONSTRAINT ingredient_expiry_settings_shop_id_ingredient_id_key UNIQUE (shop_id, ingredient_id);


--
-- Name: ingredient_lots ingredient_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_lots
    ADD CONSTRAINT ingredient_lots_pkey PRIMARY KEY (id);


--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: menu menu_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu
    ADD CONSTRAINT menu_pkey PRIMARY KEY (id);


--
-- Name: menu_serve_types menu_serve_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_serve_types
    ADD CONSTRAINT menu_serve_types_pkey PRIMARY KEY (id);


--
-- Name: menu_serves menu_serves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_serves
    ADD CONSTRAINT menu_serves_pkey PRIMARY KEY (id);


--
-- Name: menu_variants menu_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_variants
    ADD CONSTRAINT menu_variants_pkey PRIMARY KEY (id);


--
-- Name: news news_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: pos_idempotency pos_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_idempotency
    ADD CONSTRAINT pos_idempotency_pkey PRIMARY KEY (key);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: recipe_items recipe_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_items
    ADD CONSTRAINT recipe_items_pkey PRIMARY KEY (id);


--
-- Name: recipe_items recipe_items_unique_variant_ingredient; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_items
    ADD CONSTRAINT recipe_items_unique_variant_ingredient UNIQUE (variant_id, ingredient_id);


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);


--
-- Name: shop_members shop_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_members
    ADD CONSTRAINT shop_members_pkey PRIMARY KEY (shop_id, user_id);


--
-- Name: shops shops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_pkey PRIMARY KEY (id);


--
-- Name: stock_logs stock_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id);


--
-- Name: waste_logs waste_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_logs
    ADD CONSTRAINT waste_logs_pkey PRIMARY KEY (id);


--
-- Name: branch_one_primary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branch_one_primary_idx ON public.branch USING btree (shop_id) WHERE ((is_primary = true) AND (shop_id IS NOT NULL));


--
-- Name: branch_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branch_shop_id_idx ON public.branch USING btree (shop_id);


--
-- Name: idx_branch_menu_availability_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_menu_availability_branch ON public.branch_menu_availability USING btree (branch_id);


--
-- Name: idx_branch_menu_availability_menu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_menu_availability_menu ON public.branch_menu_availability USING btree (menu_id);


--
-- Name: idx_branch_menu_availability_shop_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_menu_availability_shop_branch ON public.branch_menu_availability USING btree (shop_id, branch_id);


--
-- Name: idx_cash_movements_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_movements_created_by ON public.cash_movements USING btree (created_by);


--
-- Name: idx_cash_movements_shop_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_movements_shop_branch_date ON public.cash_movements USING btree (shop_id, branch_id, business_date);


--
-- Name: idx_cash_movements_shop_branch_date_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_movements_shop_branch_date_created ON public.cash_movements USING btree (shop_id, branch_id, business_date, created_at);


--
-- Name: idx_daily_closes_shop_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_closes_shop_branch_date ON public.daily_closes USING btree (shop_id, branch_id, business_date);


--
-- Name: idx_daily_closes_shop_branch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_closes_shop_branch_status ON public.daily_closes USING btree (shop_id, branch_id, status);


--
-- Name: idx_ingredients_archived_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredients_archived_at ON public.ingredients USING btree (archived_at);


--
-- Name: idx_ingredients_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredients_branch ON public.ingredients USING btree (branch_id);


--
-- Name: idx_ingredients_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredients_is_active ON public.ingredients USING btree (is_active);


--
-- Name: idx_ingredients_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredients_name ON public.ingredients USING btree (name);


--
-- Name: idx_ingredients_shop_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredients_shop_branch ON public.ingredients USING btree (shop_id, branch_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_shop_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_shop_created ON public.orders USING btree (shop_id, created_at DESC);


--
-- Name: idx_recipes_ingredient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipes_ingredient ON public.recipes USING btree (ingredient_id);


--
-- Name: idx_recipes_menu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipes_menu ON public.recipes USING btree (menu_id);


--
-- Name: idx_stock_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_logs_created_at ON public.stock_logs USING btree (created_at DESC);


--
-- Name: idx_stock_logs_ingredient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_logs_ingredient_id ON public.stock_logs USING btree (ingredient_id);


--
-- Name: idx_stock_logs_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_logs_order_id ON public.stock_logs USING btree (order_id);


--
-- Name: idx_stock_logs_shop_branch_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_logs_shop_branch_created_at ON public.stock_logs USING btree (shop_id, branch_id, created_at DESC);


--
-- Name: ingredient_lots_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingredient_lots_expiry_idx ON public.ingredient_lots USING btree (shop_id, branch_id, expires_at);


--
-- Name: ingredient_lots_ingredient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingredient_lots_ingredient_idx ON public.ingredient_lots USING btree (shop_id, ingredient_id);


--
-- Name: ingredient_lots_opened_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingredient_lots_opened_idx ON public.ingredient_lots USING btree (shop_id, branch_id, opened_at);


--
-- Name: ingredient_lots_shop_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingredient_lots_shop_branch_idx ON public.ingredient_lots USING btree (shop_id, branch_id);


--
-- Name: ingredient_lots_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingredient_lots_status_idx ON public.ingredient_lots USING btree (shop_id, branch_id, status);


--
-- Name: ingredients_active_name_branch_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ingredients_active_name_branch_key_uniq ON public.ingredients USING btree (shop_id, branch_id, lower(btrim(name))) WHERE ((COALESCE(is_active, true) = true) AND (shop_id IS NOT NULL) AND (branch_id IS NOT NULL));


--
-- Name: ingredients_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingredients_is_active_idx ON public.ingredients USING btree (is_active);


--
-- Name: ingredients_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingredients_shop_id_idx ON public.ingredients USING btree (shop_id);


--
-- Name: menu_categories_shop_name_ux; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menu_categories_shop_name_ux ON public.menu_categories USING btree (shop_id, name);


--
-- Name: menu_id_shop_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menu_id_shop_unique ON public.menu USING btree (id, shop_id);


--
-- Name: menu_serve_types_shop_system_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menu_serve_types_shop_system_key_uniq ON public.menu_serve_types USING btree (shop_id, system_key) WHERE (system_key IS NOT NULL);


--
-- Name: menu_serves_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menu_serves_unique ON public.menu_serves USING btree (shop_id, menu_id, serve_type_id);


--
-- Name: menu_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menu_shop_id_idx ON public.menu USING btree (shop_id);


--
-- Name: menu_variants_id_shop_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menu_variants_id_shop_unique ON public.menu_variants USING btree (id, shop_id);


--
-- Name: menu_variants_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menu_variants_one_default ON public.menu_variants USING btree (shop_id, menu_id, serve_type_id) WHERE (is_default = true);


--
-- Name: menu_variants_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menu_variants_shop_id_idx ON public.menu_variants USING btree (shop_id);


--
-- Name: menu_variants_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX menu_variants_unique ON public.menu_variants USING btree (shop_id, menu_id, serve_type_id, size);


--
-- Name: news_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX news_shop_id_idx ON public.news USING btree (shop_id);


--
-- Name: order_items_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_shop_id_idx ON public.order_items USING btree (shop_id);


--
-- Name: orders_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_shop_id_idx ON public.orders USING btree (shop_id);


--
-- Name: profiles_current_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_current_shop_id_idx ON public.profiles USING btree (current_shop_id);


--
-- Name: recipe_items_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recipe_items_shop_id_idx ON public.recipe_items USING btree (shop_id);


--
-- Name: recipes_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recipes_shop_id_idx ON public.recipes USING btree (shop_id);


--
-- Name: serve_type_id_shop_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX serve_type_id_shop_unique ON public.menu_serve_types USING btree (id, shop_id);


--
-- Name: shop_members_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_members_shop_id_idx ON public.shop_members USING btree (shop_id);


--
-- Name: shop_members_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_members_user_id_idx ON public.shop_members USING btree (user_id);


--
-- Name: shops_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shops_slug_key ON public.shops USING btree (slug);


--
-- Name: stock_logs_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_logs_shop_id_idx ON public.stock_logs USING btree (shop_id);


--
-- Name: ux_menu_id_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_menu_id_shop ON public.menu USING btree (id, shop_id);


--
-- Name: ux_menu_serve_types_shop_lower_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_menu_serve_types_shop_lower_name ON public.menu_serve_types USING btree (shop_id, lower(name));


--
-- Name: ux_serve_type_id_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_serve_type_id_shop ON public.menu_serve_types USING btree (id, shop_id);


--
-- Name: ux_serve_types_name_per_shop_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_serve_types_name_per_shop_ci ON public.menu_serve_types USING btree (shop_id, lower(name));


--
-- Name: ux_serve_types_one_default_per_shop; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_serve_types_one_default_per_shop ON public.menu_serve_types USING btree (shop_id) WHERE ((is_system = true) AND (system_key = 'default'::text));


--
-- Name: waste_logs_ingredient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waste_logs_ingredient_idx ON public.waste_logs USING btree (shop_id, ingredient_id, created_at DESC);


--
-- Name: waste_logs_shop_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waste_logs_shop_branch_idx ON public.waste_logs USING btree (shop_id, branch_id, created_at DESC);


--
-- Name: menu_variants menu_variants_prevent_default_loss; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER menu_variants_prevent_default_loss BEFORE DELETE OR UPDATE OF menu_id, serve_type_id ON public.menu_variants FOR EACH ROW EXECUTE FUNCTION public.tg_menu_variants_prevent_default_loss();

ALTER TABLE public.menu_variants DISABLE TRIGGER menu_variants_prevent_default_loss;


--
-- Name: menu_variants menu_variants_single_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER menu_variants_single_default BEFORE INSERT OR UPDATE OF is_default ON public.menu_variants FOR EACH ROW WHEN ((new.is_default IS TRUE)) EXECUTE FUNCTION public.tg_menu_variants_single_default();


--
-- Name: ingredients tg_ingredients_set_name_key; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_ingredients_set_name_key BEFORE INSERT OR UPDATE OF name ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.ingredients_set_name_key();


--
-- Name: menu_serve_types trg_block_system_menu_serve_types_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_system_menu_serve_types_mutation BEFORE DELETE OR UPDATE ON public.menu_serve_types FOR EACH ROW EXECUTE FUNCTION public.block_system_menu_serve_types_mutation();


--
-- Name: shops trg_ensure_default_branch_for_new_shop; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_default_branch_for_new_shop AFTER INSERT ON public.shops FOR EACH ROW EXECUTE FUNCTION public.ensure_default_branch_for_new_shop();


--
-- Name: ingredient_expiry_settings trg_ingredient_expiry_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ingredient_expiry_settings_updated_at BEFORE UPDATE ON public.ingredient_expiry_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ingredient_lots trg_ingredient_lots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ingredient_lots_updated_at BEFORE UPDATE ON public.ingredient_lots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ingredients trg_log_stock_add; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_stock_add AFTER INSERT ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.log_stock_add();


--
-- Name: branch trg_prevent_delete_last_branch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_delete_last_branch BEFORE DELETE ON public.branch FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_last_branch();


--
-- Name: order_items trg_sync_order_items_shop_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_order_items_shop_id BEFORE INSERT OR UPDATE OF order_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.sync_order_items_shop_id();


--
-- Name: branch_menu_availability branch_menu_availability_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_availability
    ADD CONSTRAINT branch_menu_availability_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branch(id) ON DELETE CASCADE;


--
-- Name: branch_menu_availability branch_menu_availability_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_availability
    ADD CONSTRAINT branch_menu_availability_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menu(id) ON DELETE CASCADE;


--
-- Name: branch_menu_availability branch_menu_availability_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_availability
    ADD CONSTRAINT branch_menu_availability_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: branch branch_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch
    ADD CONSTRAINT branch_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: recipes fk_recipe_ingredient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT fk_recipe_ingredient FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;


--
-- Name: recipes fk_recipe_menu; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT fk_recipe_menu FOREIGN KEY (menu_id) REFERENCES public.menu(id) ON DELETE CASCADE;


--
-- Name: ingredient_expiry_settings ingredient_expiry_settings_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_expiry_settings
    ADD CONSTRAINT ingredient_expiry_settings_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;


--
-- Name: ingredient_expiry_settings ingredient_expiry_settings_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_expiry_settings
    ADD CONSTRAINT ingredient_expiry_settings_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: ingredient_lots ingredient_lots_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_lots
    ADD CONSTRAINT ingredient_lots_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branch(id) ON DELETE CASCADE;


--
-- Name: ingredient_lots ingredient_lots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_lots
    ADD CONSTRAINT ingredient_lots_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ingredient_lots ingredient_lots_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_lots
    ADD CONSTRAINT ingredient_lots_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;


--
-- Name: ingredient_lots ingredient_lots_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredient_lots
    ADD CONSTRAINT ingredient_lots_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: ingredients ingredients_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branch(id) ON DELETE SET NULL;


--
-- Name: ingredients ingredients_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: menu menu_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu
    ADD CONSTRAINT menu_category_fk FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE SET NULL;


--
-- Name: menu_serves menu_serves_menu_shop_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_serves
    ADD CONSTRAINT menu_serves_menu_shop_fkey FOREIGN KEY (menu_id, shop_id) REFERENCES public.menu(id, shop_id) ON DELETE CASCADE;


--
-- Name: menu_serves menu_serves_serve_type_shop_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_serves
    ADD CONSTRAINT menu_serves_serve_type_shop_fkey FOREIGN KEY (serve_type_id, shop_id) REFERENCES public.menu_serve_types(id, shop_id) ON DELETE RESTRICT;


--
-- Name: menu menu_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu
    ADD CONSTRAINT menu_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: menu_variants menu_variants_menu_shop_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_variants
    ADD CONSTRAINT menu_variants_menu_shop_fkey FOREIGN KEY (menu_id, shop_id) REFERENCES public.menu(id, shop_id) ON DELETE CASCADE;


--
-- Name: menu_variants menu_variants_serve_type_shop_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_variants
    ADD CONSTRAINT menu_variants_serve_type_shop_fkey FOREIGN KEY (serve_type_id, shop_id) REFERENCES public.menu_serve_types(id, shop_id) ON DELETE RESTRICT;


--
-- Name: menu_variants menu_variants_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_variants
    ADD CONSTRAINT menu_variants_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: news news_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_variants(id);


--
-- Name: orders orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branch(id);


--
-- Name: orders orders_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_current_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_current_branch_id_fkey FOREIGN KEY (current_branch_id) REFERENCES public.branch(id);


--
-- Name: profiles profiles_current_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_current_shop_id_fkey FOREIGN KEY (current_shop_id) REFERENCES public.shops(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: recipe_items recipe_items_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_items
    ADD CONSTRAINT recipe_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE RESTRICT;


--
-- Name: recipe_items recipe_items_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_items
    ADD CONSTRAINT recipe_items_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: recipe_items recipe_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_items
    ADD CONSTRAINT recipe_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_variants(id) ON DELETE CASCADE;


--
-- Name: recipes recipes_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: shop_members shop_members_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_members
    ADD CONSTRAINT shop_members_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: shop_members shop_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_members
    ADD CONSTRAINT shop_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: stock_logs stock_logs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branch(id);


--
-- Name: stock_logs stock_logs_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_logs stock_logs_ingredient_lot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_ingredient_lot_id_fkey FOREIGN KEY (ingredient_lot_id) REFERENCES public.ingredient_lots(id) ON DELETE SET NULL;


--
-- Name: stock_logs stock_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: stock_logs stock_logs_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_logs
    ADD CONSTRAINT stock_logs_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: waste_logs waste_logs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_logs
    ADD CONSTRAINT waste_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branch(id) ON DELETE CASCADE;


--
-- Name: waste_logs waste_logs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_logs
    ADD CONSTRAINT waste_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: waste_logs waste_logs_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_logs
    ADD CONSTRAINT waste_logs_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;


--
-- Name: waste_logs waste_logs_ingredient_lot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_logs
    ADD CONSTRAINT waste_logs_ingredient_lot_id_fkey FOREIGN KEY (ingredient_lot_id) REFERENCES public.ingredient_lots(id) ON DELETE SET NULL;


--
-- Name: waste_logs waste_logs_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_logs
    ADD CONSTRAINT waste_logs_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;


--
-- Name: profiles Users can read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: branch; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branch ENABLE ROW LEVEL SECURITY;

--
-- Name: branch branch_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_delete_owner ON public.branch FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: branch branch_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_insert_owner ON public.branch FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: branch_menu_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branch_menu_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: branch_menu_availability branch_menu_availability_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_menu_availability_delete_owner ON public.branch_menu_availability FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: branch_menu_availability branch_menu_availability_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_menu_availability_insert_owner ON public.branch_menu_availability FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: branch_menu_availability branch_menu_availability_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_menu_availability_select_staff ON public.branch_menu_availability FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: branch_menu_availability branch_menu_availability_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_menu_availability_update_owner ON public.branch_menu_availability FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: branch branch_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_select_staff ON public.branch FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: branch branch_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_update_owner ON public.branch FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: cash_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_movements cash_movements_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_movements_insert_staff ON public.cash_movements FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: cash_movements cash_movements_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_movements_select_staff ON public.cash_movements FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: contact; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact ENABLE ROW LEVEL SECURITY;

--
-- Name: contact contact_delete_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_delete_owner_only ON public.contact FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: contact contact_insert_staff_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_insert_staff_owner ON public.contact FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: contact contact_select_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_select_by_shop ON public.contact FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: contact contact_update_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_update_owner_only ON public.contact FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: daily_closes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_closes ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_closes daily_closes_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY daily_closes_insert_staff ON public.daily_closes FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop() AND (status = 'draft'::text)));


--
-- Name: daily_closes daily_closes_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY daily_closes_select_staff ON public.daily_closes FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: daily_closes daily_closes_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY daily_closes_update_owner ON public.daily_closes FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: hero; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hero ENABLE ROW LEVEL SECURITY;

--
-- Name: hero hero_select_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hero_select_by_shop ON public.hero FOR SELECT TO authenticated USING ((shop_id = public.current_shop_id()));


--
-- Name: ingredient_lots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingredient_lots ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredient_lots ingredient_lots_select_current_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredient_lots_select_current_shop ON public.ingredient_lots FOR SELECT USING ((shop_id = public.current_shop_id()));


--
-- Name: ingredient_lots ingredient_lots_write_current_shop_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredient_lots_write_current_shop_staff ON public.ingredient_lots USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredients ingredients_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredients_delete_owner ON public.ingredients FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: ingredients ingredients_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredients_insert_owner ON public.ingredients FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: ingredients ingredients_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredients_select_staff ON public.ingredients FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: ingredients ingredients_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredients_update_owner ON public.ingredients FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: menu; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories menu_categories_select_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_select_by_shop ON public.menu_categories FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: menu_categories menu_categories_write_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_write_owner_only ON public.menu_categories TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: menu menu_delete_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_delete_owner_only ON public.menu FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: menu menu_insert_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_insert_owner_only ON public.menu FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: menu menu_select_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_select_by_shop ON public.menu FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: menu_serve_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_serve_types ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_serve_types menu_serve_types_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_serve_types_delete_owner ON public.menu_serve_types FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop() AND (system_key IS NULL) AND (is_system = false)));


--
-- Name: menu_serve_types menu_serve_types_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_serve_types_insert_owner ON public.menu_serve_types FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop() AND (is_system = false) AND (system_key IS NULL)));


--
-- Name: menu_serve_types menu_serve_types_select_shop_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_serve_types_select_shop_members ON public.menu_serve_types FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND (public.is_owner_in_current_shop() OR public.is_staff_in_current_shop())));


--
-- Name: menu_serve_types menu_serve_types_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_serve_types_update_owner ON public.menu_serve_types FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop() AND (system_key IS NULL) AND (is_system = false))) WITH CHECK (((shop_id = public.current_shop_id()) AND (system_key IS NULL) AND (is_system = false)));


--
-- Name: menu_serves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_serves ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_serves menu_serves_select_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_serves_select_by_shop ON public.menu_serves FOR SELECT TO authenticated USING ((shop_id = public.current_shop_id()));


--
-- Name: menu_serves menu_serves_write_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_serves_write_owner_only ON public.menu_serves TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: menu menu_update_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_update_owner_only ON public.menu FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: menu_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_variants menu_variants_delete_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_variants_delete_owner_only ON public.menu_variants FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: menu_variants menu_variants_insert_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_variants_insert_owner_only ON public.menu_variants FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: menu_variants menu_variants_select_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_variants_select_by_shop ON public.menu_variants FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: menu_variants menu_variants_update_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_variants_update_owner_only ON public.menu_variants FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: news; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

--
-- Name: news news_delete_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY news_delete_owner_only ON public.news FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: news news_insert_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY news_insert_owner_only ON public.news FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: news news_select_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY news_select_by_shop ON public.news FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: news news_update_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY news_update_owner_only ON public.news FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_delete_owner ON public.order_items FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: order_items order_items_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_insert_staff ON public.order_items FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: order_items order_items_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_select_staff ON public.order_items FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.shop_id = public.current_shop_id())))) AND public.is_staff_in_current_shop()));


--
-- Name: order_items order_items_update_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_update_staff ON public.order_items FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_delete_owner ON public.orders FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: orders orders_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_insert_staff ON public.orders FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: orders orders_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_select_staff ON public.orders FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: orders orders_update_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_update_staff ON public.orders FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: pos_idempotency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_idempotency ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_idempotency pos_idempotency_delete_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_idempotency_delete_owner_only ON public.pos_idempotency FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: pos_idempotency pos_idempotency_insert_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_idempotency_insert_by_shop ON public.pos_idempotency FOR INSERT TO authenticated WITH CHECK ((shop_id = public.current_shop_id()));


--
-- Name: pos_idempotency pos_idempotency_select_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_idempotency_select_by_shop ON public.pos_idempotency FOR SELECT TO authenticated USING ((shop_id = public.current_shop_id()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: recipe_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;

--
-- Name: recipe_items recipe_items_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipe_items_delete_owner ON public.recipe_items FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: recipe_items recipe_items_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipe_items_insert_owner ON public.recipe_items FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: recipe_items recipe_items_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipe_items_select_staff ON public.recipe_items FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: recipe_items recipe_items_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipe_items_update_owner ON public.recipe_items FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: recipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes recipes_delete_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipes_delete_owner_only ON public.recipes FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: recipes recipes_insert_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipes_insert_owner_only ON public.recipes FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: recipes recipes_select_by_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipes_select_by_shop ON public.recipes FOR SELECT TO authenticated USING ((shop_id = public.current_shop_id()));


--
-- Name: recipes recipes_update_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipes_update_owner_only ON public.recipes FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: shop_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_members shop_members_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shop_members_owner_delete ON public.shop_members FOR DELETE TO authenticated USING (public.is_shop_owner(shop_id));


--
-- Name: shop_members shop_members_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shop_members_owner_insert ON public.shop_members FOR INSERT TO authenticated WITH CHECK (public.is_shop_owner(shop_id));


--
-- Name: shop_members shop_members_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shop_members_owner_update ON public.shop_members FOR UPDATE TO authenticated USING (public.is_shop_owner(shop_id)) WITH CHECK (public.is_shop_owner(shop_id));


--
-- Name: shop_members shop_members_select_same_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shop_members_select_same_shop ON public.shop_members FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));


--
-- Name: shop_members shop_members_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shop_members_select_self ON public.shop_members FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: shops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

--
-- Name: shops shops_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shops_delete_owner ON public.shops FOR DELETE TO authenticated USING (public.is_shop_owner(id));


--
-- Name: shops shops_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shops_insert ON public.shops FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: shops shops_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shops_select ON public.shops FOR SELECT TO authenticated USING (public.is_shop_member(id));


--
-- Name: shops shops_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shops_update_owner ON public.shops FOR UPDATE TO authenticated USING (public.is_shop_owner(id)) WITH CHECK (public.is_shop_owner(id));


--
-- Name: stock_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_logs stock_logs_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_logs_delete_owner ON public.stock_logs FOR DELETE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: stock_logs stock_logs_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_logs_insert_owner ON public.stock_logs FOR INSERT TO authenticated WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: stock_logs stock_logs_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_logs_select_staff ON public.stock_logs FOR SELECT TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: stock_logs stock_logs_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_logs_update_owner ON public.stock_logs FOR UPDATE TO authenticated USING (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop())) WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_owner_in_current_shop()));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_read_own ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: waste_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waste_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: waste_logs waste_logs_insert_current_shop_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waste_logs_insert_current_shop_staff ON public.waste_logs FOR INSERT WITH CHECK (((shop_id = public.current_shop_id()) AND public.is_staff_in_current_shop()));


--
-- Name: waste_logs waste_logs_select_current_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waste_logs_select_current_shop ON public.waste_logs FOR SELECT USING ((shop_id = public.current_shop_id()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION adjust_stock(ing_id uuid, diff numeric, note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.adjust_stock(ing_id uuid, diff numeric, note text) TO anon;
GRANT ALL ON FUNCTION public.adjust_stock(ing_id uuid, diff numeric, note text) TO authenticated;
GRANT ALL ON FUNCTION public.adjust_stock(ing_id uuid, diff numeric, note text) TO service_role;


--
-- Name: PROCEDURE apply_shop_rls(IN p_table text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON PROCEDURE public.apply_shop_rls(IN p_table text) TO anon;
GRANT ALL ON PROCEDURE public.apply_shop_rls(IN p_table text) TO authenticated;
GRANT ALL ON PROCEDURE public.apply_shop_rls(IN p_table text) TO service_role;


--
-- Name: FUNCTION block_system_menu_serve_types_mutation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.block_system_menu_serve_types_mutation() TO anon;
GRANT ALL ON FUNCTION public.block_system_menu_serve_types_mutation() TO authenticated;
GRANT ALL ON FUNCTION public.block_system_menu_serve_types_mutation() TO service_role;


--
-- Name: FUNCTION cancel_order(p_order_id uuid, p_reason text, p_note text, p_cancelled_by text, p_restock boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_order(p_order_id uuid, p_reason text, p_note text, p_cancelled_by text, p_restock boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_order(p_order_id uuid, p_reason text, p_note text, p_cancelled_by text, p_restock boolean) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_order(p_order_id uuid, p_reason text, p_note text, p_cancelled_by text, p_restock boolean) TO service_role;


--
-- Name: FUNCTION current_branch_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_branch_id() TO anon;
GRANT ALL ON FUNCTION public.current_branch_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_branch_id() TO service_role;


--
-- Name: FUNCTION current_shop_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_shop_id() TO anon;
GRANT ALL ON FUNCTION public.current_shop_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_shop_id() TO service_role;


--
-- Name: FUNCTION deduct_stock_atomic(p_order_id uuid, p_note text, p_items jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.deduct_stock_atomic(p_order_id uuid, p_note text, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.deduct_stock_atomic(p_order_id uuid, p_note text, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.deduct_stock_atomic(p_order_id uuid, p_note text, p_items jsonb) TO service_role;


--
-- Name: FUNCTION discard_ingredient_lot(p_lot_id uuid, p_qty numeric, p_reason text, p_notes text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.discard_ingredient_lot(p_lot_id uuid, p_qty numeric, p_reason text, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.discard_ingredient_lot(p_lot_id uuid, p_qty numeric, p_reason text, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.discard_ingredient_lot(p_lot_id uuid, p_qty numeric, p_reason text, p_notes text) TO service_role;


--
-- Name: FUNCTION ensure_default_branch_for_new_shop(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_default_branch_for_new_shop() TO anon;
GRANT ALL ON FUNCTION public.ensure_default_branch_for_new_shop() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_default_branch_for_new_shop() TO service_role;


--
-- Name: FUNCTION ensure_default_serve_type(p_shop_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_default_serve_type(p_shop_id uuid) TO anon;
GRANT ALL ON FUNCTION public.ensure_default_serve_type(p_shop_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_default_serve_type(p_shop_id uuid) TO service_role;


--
-- Name: FUNCTION get_expiry_alert_summary(p_shop_id uuid, p_branch_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_expiry_alert_summary(p_shop_id uuid, p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_expiry_alert_summary(p_shop_id uuid, p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_expiry_alert_summary(p_shop_id uuid, p_branch_id uuid) TO service_role;


--
-- Name: FUNCTION increment_stock(ing_id uuid, diff numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_stock(ing_id uuid, diff numeric) TO anon;
GRANT ALL ON FUNCTION public.increment_stock(ing_id uuid, diff numeric) TO authenticated;
GRANT ALL ON FUNCTION public.increment_stock(ing_id uuid, diff numeric) TO service_role;


--
-- Name: FUNCTION ingredients_set_name_key(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ingredients_set_name_key() TO anon;
GRANT ALL ON FUNCTION public.ingredients_set_name_key() TO authenticated;
GRANT ALL ON FUNCTION public.ingredients_set_name_key() TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION is_owner_in_current_shop(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_owner_in_current_shop() TO anon;
GRANT ALL ON FUNCTION public.is_owner_in_current_shop() TO authenticated;
GRANT ALL ON FUNCTION public.is_owner_in_current_shop() TO service_role;


--
-- Name: FUNCTION is_shop_member(p_shop_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_shop_member(p_shop_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_shop_member(p_shop_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_shop_member(p_shop_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_shop_member(p_shop_id uuid) TO service_role;


--
-- Name: FUNCTION is_shop_owner(p_shop_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_shop_owner(p_shop_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_shop_owner(p_shop_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_shop_owner(p_shop_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_shop_owner(p_shop_id uuid) TO service_role;


--
-- Name: FUNCTION is_staff_in_current_shop(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_staff_in_current_shop() TO anon;
GRANT ALL ON FUNCTION public.is_staff_in_current_shop() TO authenticated;
GRANT ALL ON FUNCTION public.is_staff_in_current_shop() TO service_role;


--
-- Name: FUNCTION log_stock_add(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_stock_add() TO anon;
GRANT ALL ON FUNCTION public.log_stock_add() TO authenticated;
GRANT ALL ON FUNCTION public.log_stock_add() TO service_role;


--
-- Name: TABLE ingredient_lots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ingredient_lots TO authenticated;
GRANT ALL ON TABLE public.ingredient_lots TO service_role;


--
-- Name: FUNCTION mark_ingredient_lot_opened(p_lot_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_ingredient_lot_opened(p_lot_id uuid) TO anon;
GRANT ALL ON FUNCTION public.mark_ingredient_lot_opened(p_lot_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_ingredient_lot_opened(p_lot_id uuid) TO service_role;


--
-- Name: FUNCTION prevent_delete_last_branch(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_delete_last_branch() TO anon;
GRANT ALL ON FUNCTION public.prevent_delete_last_branch() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_delete_last_branch() TO service_role;


--
-- Name: FUNCTION process_pos_checkout(p_items jsonb, p_branch_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.process_pos_checkout(p_items jsonb, p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.process_pos_checkout(p_items jsonb, p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.process_pos_checkout(p_items jsonb, p_branch_id uuid) TO service_role;


--
-- Name: FUNCTION revenue_summary_range(p_start timestamp with time zone, p_end timestamp with time zone, p_by text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.revenue_summary_range(p_start timestamp with time zone, p_end timestamp with time zone, p_by text) TO anon;
GRANT ALL ON FUNCTION public.revenue_summary_range(p_start timestamp with time zone, p_end timestamp with time zone, p_by text) TO authenticated;
GRANT ALL ON FUNCTION public.revenue_summary_range(p_start timestamp with time zone, p_end timestamp with time zone, p_by text) TO service_role;


--
-- Name: FUNCTION set_current_context(p_shop_id uuid, p_branch_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_current_context(p_shop_id uuid, p_branch_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_current_context(p_shop_id uuid, p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.set_current_context(p_shop_id uuid, p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.set_current_context(p_shop_id uuid, p_branch_id uuid) TO service_role;


--
-- Name: FUNCTION set_current_shop(p_shop_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_current_shop(p_shop_id uuid) TO anon;
GRANT ALL ON FUNCTION public.set_current_shop(p_shop_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.set_current_shop(p_shop_id uuid) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION sync_order_items_shop_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_order_items_shop_id() TO anon;
GRANT ALL ON FUNCTION public.sync_order_items_shop_id() TO authenticated;
GRANT ALL ON FUNCTION public.sync_order_items_shop_id() TO service_role;


--
-- Name: FUNCTION tg_menu_variants_prevent_default_loss(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_menu_variants_prevent_default_loss() TO anon;
GRANT ALL ON FUNCTION public.tg_menu_variants_prevent_default_loss() TO authenticated;
GRANT ALL ON FUNCTION public.tg_menu_variants_prevent_default_loss() TO service_role;


--
-- Name: FUNCTION tg_menu_variants_single_default(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_menu_variants_single_default() TO anon;
GRANT ALL ON FUNCTION public.tg_menu_variants_single_default() TO authenticated;
GRANT ALL ON FUNCTION public.tg_menu_variants_single_default() TO service_role;


--
-- Name: TABLE _backup_shopa_mismatch_ingredient_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._backup_shopa_mismatch_ingredient_logs TO authenticated;
GRANT ALL ON TABLE public._backup_shopa_mismatch_ingredient_logs TO service_role;


--
-- Name: TABLE _backup_stock_logs_shopa_before_fix; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._backup_stock_logs_shopa_before_fix TO authenticated;
GRANT ALL ON TABLE public._backup_stock_logs_shopa_before_fix TO service_role;


--
-- Name: TABLE branch; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.branch TO anon;
GRANT ALL ON TABLE public.branch TO authenticated;
GRANT ALL ON TABLE public.branch TO service_role;


--
-- Name: TABLE branch_menu_availability; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.branch_menu_availability TO authenticated;
GRANT ALL ON TABLE public.branch_menu_availability TO service_role;


--
-- Name: TABLE cash_movements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cash_movements TO authenticated;
GRANT ALL ON TABLE public.cash_movements TO service_role;


--
-- Name: TABLE contact; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contact TO anon;
GRANT ALL ON TABLE public.contact TO authenticated;
GRANT ALL ON TABLE public.contact TO service_role;


--
-- Name: TABLE daily_closes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_closes TO authenticated;
GRANT ALL ON TABLE public.daily_closes TO service_role;


--
-- Name: TABLE hero; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hero TO anon;
GRANT ALL ON TABLE public.hero TO authenticated;
GRANT ALL ON TABLE public.hero TO service_role;


--
-- Name: TABLE ingredient_expiry_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ingredient_expiry_settings TO authenticated;
GRANT ALL ON TABLE public.ingredient_expiry_settings TO service_role;


--
-- Name: TABLE ingredients; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ingredients TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ingredients TO authenticated;
GRANT ALL ON TABLE public.ingredients TO service_role;


--
-- Name: TABLE ingredient_lot_expiry_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ingredient_lot_expiry_status TO authenticated;
GRANT ALL ON TABLE public.ingredient_lot_expiry_status TO service_role;


--
-- Name: TABLE ingredient_expiry_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ingredient_expiry_summary TO authenticated;
GRANT ALL ON TABLE public.ingredient_expiry_summary TO service_role;


--
-- Name: TABLE menu; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu TO anon;
GRANT ALL ON TABLE public.menu TO authenticated;
GRANT ALL ON TABLE public.menu TO service_role;


--
-- Name: TABLE menu_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_categories TO anon;
GRANT ALL ON TABLE public.menu_categories TO authenticated;
GRANT ALL ON TABLE public.menu_categories TO service_role;


--
-- Name: TABLE menu_serve_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_serve_types TO anon;
GRANT ALL ON TABLE public.menu_serve_types TO authenticated;
GRANT ALL ON TABLE public.menu_serve_types TO service_role;


--
-- Name: TABLE menu_serves; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_serves TO anon;
GRANT ALL ON TABLE public.menu_serves TO authenticated;
GRANT ALL ON TABLE public.menu_serves TO service_role;


--
-- Name: TABLE menu_variants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_variants TO anon;
GRANT ALL ON TABLE public.menu_variants TO authenticated;
GRANT ALL ON TABLE public.menu_variants TO service_role;


--
-- Name: TABLE news; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.news TO anon;
GRANT ALL ON TABLE public.news TO authenticated;
GRANT ALL ON TABLE public.news TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE pos_idempotency; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pos_idempotency TO authenticated;
GRANT ALL ON TABLE public.pos_idempotency TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE recipe_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recipe_items TO anon;
GRANT ALL ON TABLE public.recipe_items TO authenticated;
GRANT ALL ON TABLE public.recipe_items TO service_role;


--
-- Name: TABLE recipes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.recipes TO authenticated;
GRANT ALL ON TABLE public.recipes TO service_role;


--
-- Name: TABLE shop_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shop_members TO anon;
GRANT ALL ON TABLE public.shop_members TO authenticated;
GRANT ALL ON TABLE public.shop_members TO service_role;


--
-- Name: TABLE shops; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shops TO anon;
GRANT ALL ON TABLE public.shops TO authenticated;
GRANT ALL ON TABLE public.shops TO service_role;


--
-- Name: TABLE stock_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_logs TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_logs TO authenticated;
GRANT ALL ON TABLE public.stock_logs TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE v_ingredients_alert; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_ingredients_alert TO anon;
GRANT ALL ON TABLE public.v_ingredients_alert TO authenticated;
GRANT ALL ON TABLE public.v_ingredients_alert TO service_role;


--
-- Name: TABLE v_user_shop_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_user_shop_permissions TO anon;
GRANT ALL ON TABLE public.v_user_shop_permissions TO authenticated;
GRANT ALL ON TABLE public.v_user_shop_permissions TO service_role;


--
-- Name: TABLE waste_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.waste_logs TO authenticated;
GRANT ALL ON TABLE public.waste_logs TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict DudRVmBgse2ufWYQdJRNPg1ugbVth2RDJpmdLUbbWBTZNMEe5iplm5rOAcKR6xc

