-- Phase 1: Daily Close table for branch-level close/reconciliation
-- One row per shop_id + branch_id + business_date.
-- Reopen/history/versioning will be added in Phase 2.

create extension if not exists pgcrypto;

create table if not exists public.daily_closes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  branch_id uuid not null,
  business_date date not null,

  -- Cash inputs
  opening_cash_float numeric not null default 0,
  counted_cash numeric,
  expected_cash numeric not null default 0,
  cash_difference numeric,

  -- Computed sales snapshot
  gross_sales numeric not null default 0,
  net_sales numeric not null default 0,
  cash_sales numeric not null default 0,
  promptpay_sales numeric not null default 0,
  unknown_payment_sales numeric not null default 0,
  paid_order_count integer not null default 0,
  cancelled_order_count integer not null default 0,
  refunded_order_count integer not null default 0,
  void_order_count integer not null default 0,

  -- Close workflow
  status text not null default 'draft',
  closed_by uuid,
  closed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  notes text,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Constraints
  unique (shop_id, branch_id, business_date),
  constraint daily_closes_status_check check (status in ('draft', 'closed', 'approved')),
  constraint daily_closes_close_requirements check (
    (status = 'draft') or
    (status in ('closed', 'approved') and counted_cash is not null and closed_at is not null and closed_by is not null)
  ),
  constraint daily_closes_approve_requirements check (
    status <> 'approved' or
    (status = 'approved' and approved_at is not null and approved_by is not null)
  )
);

-- Indexes
create index if not exists idx_daily_closes_shop_branch_date
  on public.daily_closes (shop_id, branch_id, business_date);

create index if not exists idx_daily_closes_shop_branch_status
  on public.daily_closes (shop_id, branch_id, status);

-- RLS
alter table public.daily_closes enable row level security;

drop policy if exists daily_closes_select_staff on public.daily_closes;
create policy daily_closes_select_staff
on public.daily_closes
for select
to authenticated
using (
  shop_id = current_shop_id()
  and is_staff_in_current_shop()
);

drop policy if exists daily_closes_insert_staff on public.daily_closes;
create policy daily_closes_insert_staff
on public.daily_closes
for insert
to authenticated
with check (
  shop_id = current_shop_id()
  and is_staff_in_current_shop()
);

drop policy if exists daily_closes_update_owner on public.daily_closes;
create policy daily_closes_update_owner
on public.daily_closes
for update
to authenticated
using (
  shop_id = current_shop_id()
  and is_owner_in_current_shop()
)
with check (
  shop_id = current_shop_id()
  and is_owner_in_current_shop()
);

drop policy if exists daily_closes_delete_owner on public.daily_closes;
create policy daily_closes_delete_owner
on public.daily_closes
for delete
to authenticated
using (
  shop_id = current_shop_id()
  and is_owner_in_current_shop()
);

-- Grants
grant select, insert, update, delete
on table public.daily_closes
to authenticated;

grant all
on table public.daily_closes
to service_role;
