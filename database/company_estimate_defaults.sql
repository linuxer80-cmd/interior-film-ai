create table if not exists public.company_estimate_defaults (
  company_id uuid primary key references public.companies(id) on delete cascade,
  bank_account text not null default '' check (length(bank_account) <= 500),
  note text not null default '' check (length(note) <= 3000),
  updated_at timestamptz not null default now()
);
alter table public.company_estimate_defaults enable row level security;
revoke all on public.company_estimate_defaults from public, anon, authenticated;
grant select, insert, update on public.company_estimate_defaults to service_role;
