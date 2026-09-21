\set ON_ERROR_STOP on
begin;
select set_config('talvo_test.business_id', :'talvo_business_id', true);
select set_config('talvo_test.actor_id', :'talvo_actor_id', true);
select set_config('request.jwt.claim.sub', :'talvo_actor_id', true);
select set_config('talvo_test.branch_id', (select id::text from public.branch where shop_id=:'talvo_business_id'::uuid and is_active order by id limit 1), true);
select set_config('talvo_test.other_branch_id', (select id::text from public.branch where shop_id=:'talvo_business_id'::uuid and is_active order by id desc limit 1), true);

do $fixtures$
declare s uuid:=current_setting('talvo_test.business_id')::uuid; b uuid:=current_setting('talvo_test.branch_id')::uuid;
  cat uuid:=extensions.gen_random_uuid(); serve uuid:=extensions.gen_random_uuid(); menu uuid:=extensions.gen_random_uuid();
  v uuid:=extensions.gen_random_uuid(); ingredient uuid:=extensions.gen_random_uuid();
begin
  insert into public.menu_categories(id,shop_id,name) values(cat,s,'Sale integration');
  insert into public.menu_serve_types(id,shop_id,name) values(serve,s,'Integration serve');
  insert into public.menu(id,shop_id,category_id,name,price) values(menu,s,cat,'Snapshot coffee',60);
  insert into public.menu_variants(id,shop_id,menu_id,serve_type_id,is_default) values(v,s,menu,serve,true);
  insert into public.ingredients(id,shop_id,branch_id,name,stock,unit,base_unit,is_active) values(ingredient,s,b,'Legacy beans',1000,'g','g',true);
  insert into public.recipe_items(shop_id,branch_id,variant_id,ingredient_id,quantity) values(s,b,v,ingredient,20);
  perform set_config('talvo_test.variant_id',v::text,true);
  perform set_config('talvo_test.ingredient_id',ingredient::text,true);
end $fixtures$;

set local role authenticated;
do $canonical_fixture$
declare s uuid:=current_setting('talvo_test.business_id')::uuid; b uuid:=current_setting('talvo_test.branch_id')::uuid; r jsonb;
begin
  r:=public.create_talvo_supply_item(s,'Canonical sale milk','10000000-0000-4000-8000-000000000002',0.001,false,'NON_EXPIRING','sale-fixture-create-milk');
  if r->>'ok' is distinct from 'true' then raise exception 'Create fixture: %',r; end if;
  perform set_config('talvo_test.supply_item_id',r#>>'{data,supply_item_id}',true);
  r:=public.receive_talvo_supply_item(s,b,current_setting('talvo_test.supply_item_id')::uuid,10,'sale-fixture-receive',null,null,'sale-fixture-receive-milk');
  if r->>'ok' is distinct from 'true' then raise exception 'Receive fixture: %',r; end if;
  r:=public.receive_talvo_supply_item(s,current_setting('talvo_test.other_branch_id')::uuid,current_setting('talvo_test.supply_item_id')::uuid,7,'other-branch',null,null,'sale-fixture-receive-other');
  if r->>'ok' is distinct from 'true' then raise exception 'Other branch Receive: %',r; end if;
end $canonical_fixture$;
reset role;
insert into public.recipe_items(shop_id,branch_id,variant_id,supply_item_id,quantity)
values(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.variant_id')::uuid,current_setting('talvo_test.supply_item_id')::uuid,0.150);

set local role authenticated;
do $happy_replay$
declare r jsonb; replay jsonb; items jsonb:=jsonb_build_array(
  jsonb_build_object('variant_id',current_setting('talvo_test.variant_id'),'qty',2,'sweetness','100%'),
  jsonb_build_object('variant_id',current_setting('talvo_test.variant_id'),'qty',1,'sweetness','50%'));
begin
  r:=public.process_pos_checkout_atomic(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,items,'cash',200,'sale-test-happy-0001');
  replay:=public.process_pos_checkout_atomic(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,items,'cash',200,'sale-test-happy-0001');
  if r is distinct from replay or r->>'success' is distinct from 'true' then raise exception 'Unstable replay: %, %',r,replay; end if;
  if jsonb_array_length(r#>'{order,items}')<>2 or jsonb_array_length(r#>'{order,inventory_snapshot,ingredients}')<>2 then raise exception 'Line or deduction snapshot missing: %',r; end if;
  perform set_config('talvo_test.order_id',r#>>'{order,id}',true);
  perform set_config('talvo_test.response',r::text,true);
  begin
    perform public.process_pos_checkout_atomic(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,items,'cash',201,'sale-test-happy-0001');
    raise exception 'Changed replay accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' then raise; end if;
  end;
end $happy_replay$;
reset role;

do $verify_balances$
declare q numeric; s uuid:=current_setting('talvo_test.business_id')::uuid; item uuid:=current_setting('talvo_test.supply_item_id')::uuid;
begin
  select stock into q from public.ingredients where id=current_setting('talvo_test.ingredient_id')::uuid;
  if q<>940 then raise exception 'Legacy balance expected 940, got %',q; end if;
  select sum(ib.quantity_base) into q from talvo.inventory_balances ib join talvo.ingredient_lots lot on lot.id=ib.ingredient_lot_id join talvo.inventory_locations loc on loc.id=ib.location_id where ib.business_id=s and lot.supply_item_id=item and loc.kind='BRANCH_AVAILABLE' and loc.branch_id=current_setting('talvo_test.branch_id')::uuid;
  if q<>9.55 then raise exception 'Canonical balance expected 9.55, got %',q; end if;
  select sum(ib.quantity_base) into q from talvo.inventory_balances ib join talvo.ingredient_lots lot on lot.id=ib.ingredient_lot_id join talvo.inventory_locations loc on loc.id=ib.location_id where ib.business_id=s and lot.supply_item_id=item and loc.kind='BRANCH_AVAILABLE' and loc.branch_id=current_setting('talvo_test.other_branch_id')::uuid;
  if q<>7 then raise exception 'Other branch balance changed: %',q; end if;
  select sum(ib.quantity_base) into q from talvo.inventory_balances ib join talvo.ingredient_lots lot on lot.id=ib.ingredient_lot_id join talvo.inventory_locations loc on loc.id=ib.location_id where ib.business_id=s and lot.supply_item_id=item and loc.kind='CONSUMED';
  if q<>0.45 then raise exception 'Consumed balance expected .45, got %',q; end if;
  if (select count(*) from public.orders where shop_id=s)<>1 then raise exception 'Duplicate orders'; end if;
  if (select count(*) from public.stock_logs where order_id=current_setting('talvo_test.order_id')::uuid)<>1 then raise exception 'Duplicate stock logs'; end if;
end $verify_balances$;

-- Recipe and menu edits must leave both the recorded quantities and replay unchanged.
update public.recipe_items set quantity=quantity*2 where variant_id=current_setting('talvo_test.variant_id')::uuid;
update public.menu set name='Renamed after sale' where id=(select menu_id from public.menu_variants where id=current_setting('talvo_test.variant_id')::uuid);
do $snapshot_and_guards$
declare r jsonb:=current_setting('talvo_test.response')::jsonb; snapshot jsonb; blocked boolean:=false;
begin
  select inventory_snapshot into snapshot from public.orders where id=current_setting('talvo_test.order_id')::uuid;
  if snapshot is distinct from r#>'{order,inventory_snapshot}' then raise exception 'Recipe edit changed inventory snapshot'; end if;
  if exists(select 1 from public.order_items where order_id=current_setting('talvo_test.order_id')::uuid and name<>'Snapshot coffee') then raise exception 'Historical item name changed'; end if;
  begin update public.orders set inventory_snapshot='{}' where id=current_setting('talvo_test.order_id')::uuid; exception when sqlstate '55000' then blocked:=true; end;
  if not blocked then raise exception 'Order snapshot mutable'; end if;
  blocked:=false;
  begin update public.order_items set recipe_snapshot='{}' where order_id=current_setting('talvo_test.order_id')::uuid; exception when sqlstate '55000' then blocked:=true; end;
  if not blocked then raise exception 'Recipe snapshot mutable'; end if;
end $snapshot_and_guards$;

set local role authenticated;
do $insufficient_rollback$
begin
  begin
    perform public.process_pos_checkout_atomic(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,jsonb_build_array(jsonb_build_object('variant_id',current_setting('talvo_test.variant_id'),'qty',100,'sweetness','100%')),'cash',6000,'sale-insufficient-00001');
    raise exception 'Insufficient stock accepted';
  exception when sqlstate 'P0001' then if sqlerrm<>'NOT_ENOUGH_STOCK' then raise; end if; end;
end $insufficient_rollback$;
reset role;
do $rollback_verification$
begin
  if exists(select 1 from public.pos_idempotency where key='sale-insufficient-00001') then raise exception 'Failed checkout left idempotency'; end if;
  if (select count(*) from public.orders where shop_id=current_setting('talvo_test.business_id')::uuid)<>1 then raise exception 'Failed checkout left order'; end if;
  if (select stock from public.ingredients where id=current_setting('talvo_test.ingredient_id')::uuid)<>940 then raise exception 'Failed checkout changed balance'; end if;
end $rollback_verification$;

savepoint recipe_failures;
delete from public.recipe_items where variant_id=current_setting('talvo_test.variant_id')::uuid;
set local role authenticated;
do $missing_recipe$
begin
  begin
    perform public.process_pos_checkout_atomic(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,jsonb_build_array(jsonb_build_object('variant_id',current_setting('talvo_test.variant_id'),'qty',1,'sweetness','100%')),'cash',60,'sale-missing-recipe-001');
    raise exception 'Missing recipe accepted';
  exception when sqlstate 'P0001' then if sqlerrm<>'NO_RECIPE' then raise; end if; end;
end $missing_recipe$;
reset role;
rollback to savepoint recipe_failures;
do $invalid_recipe_write$
declare blocked boolean:=false;
begin
  begin update public.recipe_items set quantity=0 where variant_id=current_setting('talvo_test.variant_id')::uuid; exception when sqlstate '22023' then blocked:=true; end;
  if not blocked then raise exception 'Zero recipe quantity accepted'; end if;
  blocked:=false;
  begin update public.recipe_items set branch_id=current_setting('talvo_test.other_branch_id')::uuid where ingredient_id=current_setting('talvo_test.ingredient_id')::uuid; exception when sqlstate '22023' then blocked:=true; end;
  if not blocked then raise exception 'Cross-branch ingredient recipe accepted'; end if;
end $invalid_recipe_write$;

savepoint disabled_ingredient;
update public.ingredients set is_active=false where id=current_setting('talvo_test.ingredient_id')::uuid;
set local role authenticated;
do $invalid_recipe_checkout$
begin
  begin
    perform public.process_pos_checkout_atomic(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,jsonb_build_array(jsonb_build_object('variant_id',current_setting('talvo_test.variant_id'),'qty',1,'sweetness','100%')),'cash',60,'sale-invalid-recipe-001');
    raise exception 'Inactive recipe ingredient accepted';
  exception when sqlstate 'P0001' then if sqlerrm<>'INVALID_RECIPE_QUANTITY' then raise; end if; end;
end $invalid_recipe_checkout$;
reset role;
rollback to savepoint disabled_ingredient;

-- Membership must be checked before serving even a valid saved response.
savepoint revoked_actor;
delete from public.shop_members where shop_id=current_setting('talvo_test.business_id')::uuid and user_id=current_setting('talvo_test.actor_id')::uuid;
set local role authenticated;
do $unauthorized$
begin
  begin
    perform public.process_pos_checkout_atomic(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,'[]','cash',200,'sale-test-happy-0001');
    raise exception 'Revoked actor accepted';
  exception when insufficient_privilege then null; end;
end $unauthorized$;
reset role;
rollback to savepoint revoked_actor;

do $acl_surface$
begin
  if has_function_privilege('anon','public.process_pos_checkout_atomic(uuid,uuid,jsonb,text,numeric,text)','EXECUTE') or has_function_privilege('service_role','public.process_pos_checkout_atomic(uuid,uuid,jsonb,text,numeric,text)','EXECUTE') then raise exception 'Checkout ACL too broad'; end if;
  if has_function_privilege('authenticated','public.process_pos_checkout(jsonb,uuid)','EXECUTE') or has_function_privilege('authenticated','public.deduct_stock_atomic(uuid,text,jsonb)','EXECUTE') or has_table_privilege('authenticated','public.orders','INSERT') or has_table_privilege('authenticated','public.pos_idempotency','UPDATE') then raise exception 'Direct mutation bypass open'; end if;
end $acl_surface$;

set local role authenticated;
do $cancel_uses_snapshot$
declare r jsonb;
begin
  r:=public.cancel_order(current_setting('talvo_test.order_id')::uuid,'ลูกค้ายกเลิก',null,'owner',true);
  if r->>'success' is distinct from 'true' then raise exception 'Cancel failed: %',r; end if;
  perform public.cancel_order(current_setting('talvo_test.order_id')::uuid,'ลูกค้ายกเลิก',null,'owner',true);
end $cancel_uses_snapshot$;
reset role;
do $verify_cancel$
declare q numeric;
begin
  if (select stock from public.ingredients where id=current_setting('talvo_test.ingredient_id')::uuid)<>1000 then raise exception 'Cancel used edited recipe or refunded twice'; end if;
  select sum(ib.quantity_base) into q from talvo.inventory_balances ib join talvo.ingredient_lots lot on lot.id=ib.ingredient_lot_id join talvo.inventory_locations loc on loc.id=ib.location_id where lot.supply_item_id=current_setting('talvo_test.supply_item_id')::uuid and loc.kind='BRANCH_AVAILABLE' and loc.branch_id=current_setting('talvo_test.branch_id')::uuid;
  if q<>10 then raise exception 'Canonical cancel used edited recipe or refunded twice: %',q; end if;
end $verify_cancel$;
rollback;
\echo 'POS Sale → Recipe → Inventory integration passed (transaction rolled back)'
