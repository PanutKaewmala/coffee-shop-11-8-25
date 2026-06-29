-- Cash movements table for Daily Close drawer tracking
-- One row per cash in/out event per shop + branch + business_date.

create extension if not exists pgcrypto;

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  branch_id uuid not null,
  business_date date not null,
  type text not null,
  reason text not null,
  amount numeric not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),

  -- Constraints
  constraint cash_movements_type_check check (type in ('cash_in', 'cash_out')),
  constraint cash_movements_reason_check check (
    reason in (
      'เติมเงินทอน',
      'ซื้อของเข้าร้าน',
      'เบิกเงินสด',
      'ฝากธนาคาร',
      'ปรับยอดเงินสด'
    )
  ),
  constraint cash_movements_amount_positive check (amount > 0)
);

-- Indexes
create index if not exists idx_cash_movements_shop_branch_date_created
  on public.cash_movements (shop_id, branch_id, business_date, created_at);

create index if not exists idx_cash_movements_shop_branch_date
  on public.cash_movements (shop_id, branch_id, business_date);

create index if not exists idx_cash_movements_created_by
  on public.cash_movements (created_by);

-- RLS
alter table public.cash_movements enable row level security;

drop policy if exists cash_movements_select_staff on public.cash_movements;
create policy cash_movements_select_staff
on public.cash_movements
for select
to authenticated
using (
  shop_id = current_shop_id()
  and is_staff_in_current_shop()
);

drop policy if exists cash_movements_insert_staff on public.cash_movements;
create policy cash_movements_insert_staff
on public.cash_movements
for insert
to authenticated
with check (
  shop_id = current_shop_id()
  and is_staff_in_current_shop()
);

-- No UPDATE/DELETE policies for MVP (service_role retains access via grant)

-- Grants
grant select, insert
on table public.cash_movements
to authenticated;

grant all
on table public.cash_movements
to service_role;
