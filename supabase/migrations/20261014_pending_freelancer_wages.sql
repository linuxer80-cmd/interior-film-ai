-- Run in Supabase SQL Editor before deploying the matching API.
-- Pending wages are separate from confirmed wages; never store zero as a wage.
create table if not exists public.worker_assignment_wage_pending (
 company_id uuid not null references public.companies(id),
 site_id uuid not null references public.sites(id),
 worker_id uuid not null references public.workers(id),
 work_date date not null,
 status text not null default 'pending' check (status in ('pending','confirmed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(company_id,site_id,worker_id,work_date)
);
alter table public.worker_assignment_wage_pending enable row level security;
revoke all on public.worker_assignment_wage_pending from anon,authenticated;
grant all on public.worker_assignment_wage_pending to service_role;

create or replace function app_private.capture_worker_assignment_wage()
returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid; amount numeric;
begin
 if not exists (
  select 1 from public.worker_relationships
  where worker_id=new.worker_id and company_id=new.company_id
    and relationship_type='freelancer' and ended_at is null
 ) then return new; end if;
 if auth.uid() is not null and not exists (
  select 1 from public.profiles p join public.companies c on c.id=p.company_id
  where p.id=auth.uid() and p.role='owner'
    and p.is_active is distinct from false and c.is_active=true and c.id=new.company_id
 ) then raise exception '업체 관리자만 배정할 수 있습니다.'; end if;
 if not exists(select 1 from public.sites where id=new.site_id and company_id=new.company_id)
 then raise exception '현장 업체를 확인해주세요.'; end if;
 select user_id into uid from public.workers
 where id=new.worker_id and company_id=new.company_id and is_active=true;
 if uid is null then raise exception '연결된 활성 시공자를 확인해주세요.'; end if;
 if exists (
  select 1 from public.worker_assignment_wages
  where company_id=new.company_id and site_id=new.site_id
   and worker_id=new.worker_id and work_date=new.work_date
 ) then
  delete from public.worker_assignment_wage_pending
   where company_id=new.company_id and site_id=new.site_id
    and worker_id=new.worker_id and work_date=new.work_date;
  return new;
 end if;
 select daily_wage into amount from public.labor_profiles where user_id=uid for share;
 if amount is null or amount<=0 or amount>100000000 then
  insert into public.worker_assignment_wage_pending(company_id,site_id,worker_id,work_date)
  values(new.company_id,new.site_id,new.worker_id,new.work_date)
  on conflict(company_id,site_id,worker_id,work_date) do nothing;
  return new;
 end if;
 insert into public.worker_assignment_wages(company_id,worker_id,site_id,work_date,daily_wage)
 values(new.company_id,new.worker_id,new.site_id,new.work_date,amount)
 on conflict do nothing;
 delete from public.worker_assignment_wage_pending
 where company_id=new.company_id and site_id=new.site_id
  and worker_id=new.worker_id and work_date=new.work_date;
 return new;
end $$;
revoke all on function app_private.capture_worker_assignment_wage() from public,anon,authenticated;
-- Existing trigger continues using this function.
