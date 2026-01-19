create table if not exists public.licenses (
  wallet text primary key,
  plan text not null,
  activated_at timestamptz,
  expires_at timestamptz,
  device_id text,
  session_token text,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists licenses_session_token_idx on public.licenses (session_token);

create table if not exists public.license_payments (
  id uuid default gen_random_uuid() primary key,
  wallet text not null,
  plan text not null,
  amount_sol numeric not null,
  status text not null,
  signature text,
  created_at timestamptz default now(),
  paid_at timestamptz
);

create index if not exists license_payments_wallet_idx on public.license_payments (wallet);
create unique index if not exists license_payments_signature_idx on public.license_payments (signature);

-- Insert admin wallet
insert into public.licenses (wallet, plan, activated_at, expires_at, created_at)
values (
  '3sxAez3yght687RKUAjN3qRxHtY12YmLJL2vBLtdM8L',
  'admin',
  now(),
  null,
  now()
)
on conflict (wallet) 
do update set 
  plan = 'admin',
  expires_at = null;

-- Plan types:
-- 'admin'  - Full access, no expiration
-- 'week'   - Weekly subscription (7 days)
-- 'month'  - Monthly subscription (30 days)
-- 'holder' - Token gate holder (no expiration, auto-deactivated if balance drops)