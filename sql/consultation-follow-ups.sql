-- Access is through authenticated owner API only; no direct client grants.
create table public.consultation_follow_ups (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  stage text not null check (stage in ('draft','sent','waiting','closed')),
  action text not null check (action in ('photos','estimate','send','contact','wait')),
  due_date date check (due_date between '2000-01-01' and '2099-12-31'),
  revision integer not null default 1 check (revision>0),
  updated_at timestamptz not null default now()
);
create index consultation_follow_ups_company_date on public.consultation_follow_ups(company_id,due_date,id);
alter table public.consultation_follow_ups enable row level security;
revoke all on public.consultation_follow_ups from public,anon,authenticated;
grant select,insert,update,delete on public.consultation_follow_ups to service_role;
