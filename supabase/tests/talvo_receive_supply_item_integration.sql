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

select :'talvo_business_id'::uuid::text as talvo_business_uuid, :'talvo_actor_id'::uuid::text as talvo_actor_uuid \gset
begin;
select set_config('talvo_test.business_id', :'talvo_business_uuid', false);
select set_config('talvo_test.actor_id', :'talvo_actor_uuid', false);
select set_config('request.jwt.claim.sub', current_setting('talvo_test.actor_id'), false);

-- Reuse CreateSupplyItem as the canonical fixture builder so Receive is tested
-- against the exact graph production creates, not hand-built fake rows.
set local role authenticated;
do $fixtures$
declare
  u jsonb;
  l jsonb;
begin
  u := public.create_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,'TALVO receive untracked','10000000-0000-4000-8000-000000000001',0.001,false,'NON_EXPIRING','receive-fixture-untracked-0001');
  l := public.create_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,'TALVO receive lot tracked','10000000-0000-4000-8000-000000000002',0.001,true,'REQUIRED_USE_BY','receive-fixture-lot-0002');
  if u->>'ok' is distinct from 'true' or l->>'ok' is distinct from 'true' then raise exception 'Fixture creation failed: %, %',u,l; end if;
  perform set_config('talvo_test.untracked_item_id',u#>>'{data,supply_item_id}',false);
  perform set_config('talvo_test.lot_item_id',l#>>'{data,supply_item_id}',false);
end $fixtures$;
reset role;

select b.id::text as talvo_branch_uuid from public.branch b where b.shop_id=current_setting('talvo_test.business_id')::uuid and b.is_active order by b.id limit 1 \gset
select set_config('talvo_test.branch_id', :'talvo_branch_uuid', false);

set local role authenticated;
do $untracked_happy_replay_conflict$
declare
  r1 jsonb; r2 jsonb; conflict jsonb;
begin
  r1 := public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.untracked_item_id')::uuid,2.500,'invoice:untracked-1',null,null,'receive-untracked-00000001');
  if r1->>'ok' is distinct from 'true' then raise exception 'Untracked receive failed: %',r1; end if;
  r2 := public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.untracked_item_id')::uuid,2.500,'invoice:untracked-1',null,null,'receive-untracked-00000001');
  if r2 is distinct from r1 then raise exception 'Replay changed result'; end if;
  conflict := public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.untracked_item_id')::uuid,3.000,'invoice:untracked-1',null,null,'receive-untracked-00000001');
  if conflict#>>'{error,code}' is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'Changed replay not rejected: %',conflict; end if;
end $untracked_happy_replay_conflict$;
reset role;

do $verify_untracked$
declare q numeric; v bigint; c bigint;
begin
  select ib.quantity_base,ib.version into q,v from talvo.inventory_balances ib join talvo.ingredient_lots lot on lot.business_id=ib.business_id and lot.id=ib.ingredient_lot_id join talvo.inventory_locations il on il.business_id=ib.business_id and il.id=ib.location_id where lot.supply_item_id=current_setting('talvo_test.untracked_item_id')::uuid and lot.system_branch_id=current_setting('talvo_test.branch_id')::uuid and il.kind='BRANCH_AVAILABLE';
  if q<>2.500 or v<>2 then raise exception 'Untracked balance/version wrong: %, %',q,v; end if;
  select count(*) into c from talvo.audit_events where business_id=current_setting('talvo_test.business_id')::uuid and aggregate_id=current_setting('talvo_test.untracked_item_id')::uuid and action='StockReceived';
  if c<>1 then raise exception 'Replay duplicated audit: %',c; end if;
end $verify_untracked$;

set local role authenticated;
do $lot_happy$
declare r jsonb; lot_id uuid; expiry timestamptz:=clock_timestamp()+interval '30 days';
begin
  r:=public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.lot_item_id')::uuid,1.250,'invoice:lot-1','BATCH-001',expiry,'receive-lot-000000000001');
  if r->>'ok' is distinct from 'true' then raise exception 'Lot receive failed: %',r; end if;
  lot_id:=(r#>>'{data,ingredient_lot_id}')::uuid;
  perform set_config('talvo_test.received_lot_id',lot_id::text,false);
end $lot_happy$;
reset role;

do $verify_lot$
declare lot_id uuid:=current_setting('talvo_test.received_lot_id')::uuid; q numeric;
begin
  if not exists(select 1 from talvo.ingredient_lots where id=lot_id and root_lot_id=id and parent_lot_id is null and system_branch_id is null and provenance_source_ref='invoice:lot-1' and external_batch_code='BATCH-001' and provenance_status='VERIFIED' and manufacturer_use_by_at=effective_use_by_at and manufacturer_use_by_at>clock_timestamp()) then raise exception 'Received lot graph invalid'; end if;
  select quantity_base into q from talvo.inventory_balances where ingredient_lot_id=lot_id;
  if q<>1.250 then raise exception 'Lot balance wrong: %',q; end if;
end $verify_lot$;

set local role authenticated;
do $deterministic_failures$
declare bad_step jsonb; expired jsonb; no_prov jsonb; wrong_branch jsonb;
begin
  bad_step:=public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.untracked_item_id')::uuid,0.0005,'invoice:x',null,null,'receive-bad-step-0000001');
  if bad_step#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'Bad step accepted: %',bad_step; end if;
  expired:=public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.lot_item_id')::uuid,1.000,'invoice:x','B2',clock_timestamp()-interval '1 second','receive-expired-00000001');
  if expired#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'Expired lot accepted: %',expired; end if;
  no_prov:=public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.lot_item_id')::uuid,1.000,'',null,clock_timestamp()+interval '1 day','receive-no-prov-00000001');
  if no_prov#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'Missing provenance accepted: %',no_prov; end if;
  wrong_branch:=public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,'ffffffff-ffff-4fff-8fff-ffffffffffff',current_setting('talvo_test.untracked_item_id')::uuid,1.000,'invoice:x',null,null,'receive-bad-branch-00001');
  if wrong_branch#>>'{error,code}' is distinct from 'NOT_FOUND' then raise exception 'Unknown branch accepted: %',wrong_branch; end if;
end $deterministic_failures$;
reset role;

-- Corrupt the canonical balance inside a savepoint, prove Receive fails closed,
-- then restore it without weakening production constraints.
savepoint before_corruption;
delete from talvo.inventory_balances ib using talvo.ingredient_lots lot,talvo.inventory_locations il where lot.business_id=ib.business_id and lot.id=ib.ingredient_lot_id and il.business_id=ib.business_id and il.id=ib.location_id and lot.supply_item_id=current_setting('talvo_test.untracked_item_id')::uuid and lot.system_branch_id=current_setting('talvo_test.branch_id')::uuid and il.kind='BRANCH_AVAILABLE';
set local role authenticated;
do $corruption_fail_closed$
declare r jsonb;
begin
  r:=public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.untracked_item_id')::uuid,1.000,'invoice:corrupt',null,null,'receive-corrupt-0000001');
  if r#>>'{error,code}' is distinct from 'INVALID_STATE' then raise exception 'Corrupt balance was auto-repaired/accepted: %',r; end if;
end $corruption_fail_closed$;
reset role;
rollback to savepoint before_corruption;

-- History guards are DB guarantees, not merely RPC behavior.
do $history_guards$
declare lot_id uuid:=current_setting('talvo_test.received_lot_id')::uuid; policy_id uuid; blocked boolean;
begin
  blocked:=false; begin update talvo.ingredient_lots set provenance_source_ref='tampered' where id=lot_id; exception when sqlstate '55000' then blocked:=true; end; if not blocked then raise exception 'Lot provenance mutation was allowed'; end if;
  blocked:=false; begin delete from talvo.ingredient_lots where id=lot_id; exception when sqlstate '55000' then blocked:=true; end; if not blocked then raise exception 'Lot delete was allowed'; end if;
  select expiry_policy_version_id into policy_id from talvo.ingredient_lots where id=lot_id;
  blocked:=false; begin update talvo.ingredient_expiry_policy_versions set mode='NON_EXPIRING' where id=policy_id; exception when sqlstate '55000' then blocked:=true; end; if not blocked then raise exception 'Activated policy semantic mutation was allowed'; end if;
  blocked:=false; begin delete from talvo.ingredient_expiry_policy_versions where id=policy_id; exception when sqlstate '55000' then blocked:=true; end; if not blocked then raise exception 'Activated policy delete was allowed'; end if;
end $history_guards$;

-- Current authorization is rechecked.
update public.shop_members set role='staff' where shop_id=current_setting('talvo_test.business_id')::uuid and user_id=current_setting('talvo_test.actor_id')::uuid;
select set_config('request.jwt.claim.sub',current_setting('talvo_test.actor_id'),false);
set local role authenticated;
do $authorization$
declare r jsonb;
begin
  r:=public.receive_talvo_supply_item(current_setting('talvo_test.business_id')::uuid,current_setting('talvo_test.branch_id')::uuid,current_setting('talvo_test.untracked_item_id')::uuid,1.000,'invoice:forbidden',null,null,'receive-forbidden-000001');
  if r#>>'{error,code}' is distinct from 'FORBIDDEN' then raise exception 'Staff receive was not forbidden: %',r; end if;
end $authorization$;
reset role;
update public.shop_members set role='owner' where shop_id=current_setting('talvo_test.business_id')::uuid and user_id=current_setting('talvo_test.actor_id')::uuid;

do $security_surface$
begin
  if not has_function_privilege('authenticated','public.receive_talvo_supply_item(uuid,uuid,uuid,numeric,text,text,timestamptz,text)','EXECUTE') then raise exception 'Authenticated cannot execute ReceiveSupplyItem'; end if;
  if has_function_privilege('anon','public.receive_talvo_supply_item(uuid,uuid,uuid,numeric,text,text,timestamptz,text)','EXECUTE') or has_function_privilege('service_role','public.receive_talvo_supply_item(uuid,uuid,uuid,numeric,text,text,timestamptz,text)','EXECUTE') then raise exception 'ReceiveSupplyItem ACL too broad'; end if;
end $security_surface$;

rollback;
\echo 'TALVO ReceiveSupplyItem integration contract passed (transaction rolled back)'
