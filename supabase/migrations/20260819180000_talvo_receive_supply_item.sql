-- TALVO backend vertical slice: ReceiveSupplyItem.
-- Contract v3: atomic, idempotent, authorization-safe stock receipt.

insert into talvo.role_capabilities(role, capability)
values ('owner', 'inventory.stock.receive')
on conflict do nothing;

-- Historical expiry-policy versions are snapshots once activated.
create function talvo.protect_expiry_policy_version_history()
returns trigger
language plpgsql
security definer