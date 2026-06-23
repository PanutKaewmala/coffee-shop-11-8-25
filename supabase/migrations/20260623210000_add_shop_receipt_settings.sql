alter table public.shops
add column if not exists tax_id text,
add column if not exists receipt_footer text;
