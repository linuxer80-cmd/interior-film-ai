-- Supabase SQL Editor에서 먼저 실행합니다.
create table if not exists public.site_daily_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  work_date date not null,
  worker_id uuid not null references public.workers(id) on delete cascade,
  role text not null check (role in ('leader', 'member')),
  created_at timestamptz not null default now(),
  unique (site_id, work_date, worker_id)
);
create unique index if not exists site_daily_one_leader
  on public.site_daily_assignments (site_id, work_date) where role = 'leader';
create index if not exists site_daily_worker_date
  on public.site_daily_assignments (worker_id, work_date);
alter table public.site_daily_assignments enable row level security;
-- 이 테이블은 인증과 업체 권한을 확인하는 서버 API에서만 접근합니다.

-- 날짜별 배정과 기존 현장별 배정을 하나의 트랜잭션에서 교체합니다.
create or replace function public.replace_site_daily_assignments(
  p_company_id uuid, p_site_id uuid, p_rows jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sites where id = p_site_id and company_id = p_company_id) then
    raise exception 'site not found';
  end if;

  delete from public.site_daily_assignments where site_id = p_site_id and company_id = p_company_id;
  insert into public.site_daily_assignments(company_id, site_id, work_date, worker_id, role)
  select p_company_id, p_site_id, (item->>'work_date')::date,
         (item->>'worker_id')::uuid, item->>'role'
  from jsonb_array_elements(p_rows) as item;

  delete from public.site_workers sw
  where sw.site_id = p_site_id and sw.company_id = p_company_id
    and not exists (select 1 from public.site_daily_assignments da
                    where da.site_id = p_site_id and da.worker_id = sw.worker_id);

  update public.site_workers sw set role = desired.role
  from (
    select worker_id, case when worker_id = (select worker_id from public.site_daily_assignments where site_id = p_site_id and role = 'leader' order by work_date, worker_id limit 1) then 'leader' else 'member' end as role
    from public.site_daily_assignments where site_id = p_site_id group by worker_id
  ) desired
  where sw.site_id = p_site_id and sw.company_id = p_company_id
    and sw.worker_id = desired.worker_id and sw.role is distinct from desired.role;

  insert into public.site_workers(company_id, site_id, worker_id, role)
  select p_company_id, p_site_id, desired.worker_id, desired.role
  from (
    select worker_id, case when worker_id = (select worker_id from public.site_daily_assignments where site_id = p_site_id and role = 'leader' order by work_date, worker_id limit 1) then 'leader' else 'member' end as role
    from public.site_daily_assignments where site_id = p_site_id group by worker_id
  ) desired
  where not exists (select 1 from public.site_workers sw
                    where sw.site_id = p_site_id and sw.worker_id = desired.worker_id);
end;
$$;
revoke all on function public.replace_site_daily_assignments(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.replace_site_daily_assignments(uuid,uuid,jsonb) to service_role;
