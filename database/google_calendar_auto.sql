-- Run in the application's Supabase SQL editor. No user token is exposed to
-- anon/authenticated; only the application's service-role server may use these.
begin;
create table if not exists public.calendar_auto_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation uuid not null default gen_random_uuid(),
  refresh_cipher text not null,
  enabled boolean not null default true,
  needs_reconnect boolean not null default false,
  last_sync_at timestamptz,
  last_error text,
  next_run_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists calendar_auto_due on public.calendar_auto_connections(next_run_at) where enabled and not needs_reconnect;
create table if not exists public.calendar_auto_pending (
  state_hash text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  verifier_cipher text not null,
  code_cipher text,
  expires_at timestamptz not null default now()+interval '10 minutes'
);
create table if not exists public.calendar_auto_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  work_date date not null,
  primary key(user_id,event_id)
);
alter table public.calendar_auto_connections enable row level security;
alter table public.calendar_auto_pending enable row level security;
alter table public.calendar_auto_events enable row level security;
revoke all on public.calendar_auto_connections,public.calendar_auto_pending,public.calendar_auto_events from public,anon,authenticated;
grant all on public.calendar_auto_connections,public.calendar_auto_pending,public.calendar_auto_events to service_role;
-- Atomic per-user lease, including across concurrent cron/manual invocations.
create or replace function public.calendar_auto_claim(p_user uuid default null)
returns setof public.calendar_auto_connections
language sql security invoker set search_path = '' as $$
  update public.calendar_auto_connections c
  set lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes'
  where c.user_id=(
    select x.user_id from public.calendar_auto_connections x
    where x.enabled and not x.needs_reconnect
      and x.next_run_at<=now()
      and (p_user is null or x.user_id=p_user)
      and (x.lease_until is null or x.lease_until<now())
    order by x.next_run_at,x.user_id
    for update skip locked limit 1
  ) returning c.*;
$$;
revoke all on function public.calendar_auto_claim(uuid) from public,anon,authenticated;
grant execute on function public.calendar_auto_claim(uuid) to service_role;
commit;
-- Verification: all three results must show RLS=true; anon/authenticated SELECT=false.
select c.relname,c.relrowsecurity as rls,
  has_table_privilege('anon',c.oid,'select') as anon_select,
  has_table_privilege('authenticated',c.oid,'select') as authenticated_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('calendar_auto_connections','calendar_auto_pending','calendar_auto_events');
