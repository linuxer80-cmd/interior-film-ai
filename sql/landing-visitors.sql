-- Anonymous browser identifiers only; server writes, super-admin API reads.
create table if not exists public.landing_visitors (
 visit_day date not null default ((now() at time zone 'Asia/Seoul')::date),
 visitor_id uuid not null,
 created_at timestamptz not null default now(),
 primary key (visit_day, visitor_id)
);
alter table public.landing_visitors enable row level security;
revoke all on public.landing_visitors from anon, authenticated;
grant select, insert on public.landing_visitors to service_role;
create or replace function public.landing_visitor_stats() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'today', count(distinct visitor_id) filter (where visit_day = (now() at time zone 'Asia/Seoul')::date),
  'week', count(distinct visitor_id) filter (where visit_day >= (now() at time zone 'Asia/Seoul')::date - 6),
  'month', count(distinct visitor_id) filter (where visit_day >= (now() at time zone 'Asia/Seoul')::date - 29),
  'total', count(distinct visitor_id),
  'firstVisit', min(created_at)
 ) from public.landing_visitors;
$$;
revoke all on function public.landing_visitor_stats() from public, anon, authenticated;
grant execute on function public.landing_visitor_stats() to service_role;
