begin;
-- Representative activity is deliberately separate from employee payroll.
create table if not exists public.owner_work_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  mode text not null default 'manage' check (mode in ('solo','mixed','manage')),
  include_labor boolean not null default false,
  daily_wage integer not null default 0 check (daily_wage between 0 and 10000000),
  updated_at timestamptz not null default now()
);
create table if not exists public.owner_site_participation (
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participating boolean not null,
  updated_at timestamptz not null default now(),
  primary key(company_id,user_id,site_id)
);
create index if not exists owner_site_participation_site_idx on public.owner_site_participation(site_id);
create table if not exists public.owner_work_days (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null default (now() at time zone 'Asia/Seoul')::date,
  site_id uuid not null references public.sites(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  labor_amount integer not null default 0 check (labor_amount between 0 and 10000000),
  primary key(company_id,user_id,work_date),
  check (checked_out_at is null or checked_out_at >= checked_in_at)
);
create index if not exists owner_work_days_site_idx on public.owner_work_days(company_id,site_id,work_date);
-- Access only through the server, which validates the active company owner.
alter table public.owner_work_settings enable row level security;
alter table public.owner_site_participation enable row level security;
alter table public.owner_work_days enable row level security;
revoke all on public.owner_work_settings,public.owner_site_participation,public.owner_work_days from public,anon,authenticated;
grant select,insert,update on public.owner_work_settings,public.owner_site_participation,public.owner_work_days to service_role;
commit;
