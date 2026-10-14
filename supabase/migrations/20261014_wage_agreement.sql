-- Explicit two-party wage agreement. Apply only after pending wage migration.
create table if not exists public.worker_wage_agreements (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 site_id uuid not null references public.sites(id),
 worker_id uuid not null references public.workers(id),
 work_date date not null,
 proposed_wage numeric not null check(proposed_wage>0 and proposed_wage<=100000000),
 status text not null default 'proposed' check(status in ('proposed','accepted','rejected')),
 proposed_by uuid not null references auth.users(id),
 responded_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,site_id,worker_id,work_date)
);
alter table public.worker_wage_agreements enable row level security;
revoke all on public.worker_wage_agreements from anon,authenticated;
grant all on public.worker_wage_agreements to service_role;
create or replace function public.respond_worker_wage_agreement(
 p_agreement uuid,p_user uuid,p_accept boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.worker_wage_agreements%rowtype;
begin
 select * into a from public.worker_wage_agreements where id=p_agreement for update;
 if not found then raise exception '합의 요청을 찾을 수 없습니다.'; end if;
 if a.status<>'proposed' then raise exception '이미 처리된 합의 요청입니다.'; end if;
 if not exists(select 1 from public.workers w where w.id=a.worker_id
   and w.company_id=a.company_id and w.user_id=p_user and w.is_active=true)
 then raise exception '해당 시공자만 확인할 수 있습니다.'; end if;
 if not exists(select 1 from public.site_daily_assignments d where d.company_id=a.company_id
   and d.site_id=a.site_id and d.worker_id=a.worker_id and d.work_date=a.work_date)
 then raise exception '현장 배정이 해제되었습니다.'; end if;
 if exists(select 1 from public.worker_assignment_wages w where w.company_id=a.company_id
   and w.site_id=a.site_id and w.worker_id=a.worker_id and w.work_date=a.work_date)
 then raise exception '이미 확정된 일당은 변경할 수 없습니다.'; end if;
 update public.worker_wage_agreements set status=case when p_accept then 'accepted' else 'rejected' end,
   responded_at=now(),updated_at=now() where id=a.id;
 if p_accept then
   insert into public.worker_assignment_wages(company_id,site_id,worker_id,work_date,daily_wage)
   values(a.company_id,a.site_id,a.worker_id,a.work_date,a.proposed_wage);
   delete from public.worker_assignment_wage_pending where company_id=a.company_id
    and site_id=a.site_id and worker_id=a.worker_id and work_date=a.work_date;
 end if;
 return jsonb_build_object('ok',true,'status',case when p_accept then 'accepted' else 'rejected' end);
end $$;
revoke all on function public.respond_worker_wage_agreement(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.respond_worker_wage_agreement(uuid,uuid,boolean) to service_role;
