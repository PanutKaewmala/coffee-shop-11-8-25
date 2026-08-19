-- Pre-merge hardening for ReceiveSupplyItem Contract v3.
-- This file is intentionally small while the feature is under adversarial test.
-- Fold into 20260819180000 before merge once the contract is green.

create function talvo.protect_ingredient_lot_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'TALVO_INGREDIENT_LOT_HISTORY_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger talvo_ingredient_lot_identity_guard
before update on talvo.ingredient_lots
for each row execute function talvo.protect_ingredient_lot_identity();

create function talvo.reject_ingredient_lot_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'TALVO_INGREDIENT_LOT_HISTORY_IMMUTABLE' using errcode = '55000';
end
$$;

create trigger talvo_ingredient_lot_delete_guard
before delete on talvo.ingredient_lots
for each row execute function talvo.reject_ingredient_lot_delete();

create function talvo.reject_activated_expiry_policy_version_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.activated_at is not null then
    raise exception 'TALVO_EXPIRY_POLICY_VERSION_HISTORY_IMMUTABLE' using errcode = '55000';
  end if;
  return old;
end
$$;

create trigger talvo_expiry_policy_version_delete_guard
before delete on talvo.ingredient_expiry_policy_versions
for each row execute function talvo.reject_activated_expiry_policy_version_delete();

revoke all on function talvo.protect_ingredient_lot_identity() from public, anon, authenticated, service_role;
revoke all on function talvo.reject_ingredient_lot_delete() from public, anon, authenticated, service_role;
revoke all on function talvo.reject_activated_expiry_policy_version_delete() from public, anon, authenticated, service_role;