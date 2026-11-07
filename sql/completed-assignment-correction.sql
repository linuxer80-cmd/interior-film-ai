create table public.site_assignment_corrections (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 site_id uuid not null references public.sites(id) on delete cascade,
 actor_id uuid not null,
 reason text not null check(length(reason) between 2 and 500),
 before_rows jsonb not null, after_rows jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.site_assignment_corrections enable row level security;
revoke all on public.site_assignment_corrections from public,anon,authenticated;
grant select,insert on public.site_assignment_corrections to service_role;
create index on public.site_assignment_corrections(company_id,site_id,created_at desc);
create or replace function public.correct_completed_assignments(p_company_id uuid,p_site_id uuid,p_actor_id uuid,p_rows jsonb,p_reason text,p_preview boolean,p_expected jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_rows jsonb; new_rows jsonb; v_status text; before_cost numeric; after_cost numeric; unknown_count int; previous_batch text;
begin
 if not exists(select 1 from public.profiles p join public.companies c on c.id=p.company_id where p.id=p_actor_id and p.company_id=p_company_id and p.role='owner' and p.is_active=true and c.is_active=true) then raise exception '활성 업체 관리자만 정정할 수 있습니다.' using errcode='42501'; end if;
 select status into v_status from public.sites where id=p_site_id and company_id=p_company_id for update;
 if v_status is distinct from 'completed' then raise exception '완료 현장만 정정할 수 있습니다.'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 2 and 500 then raise exception '정정 사유를 2~500자로 입력해주세요.'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception '배정 형식을 확인해주세요.'; end if;
 select coalesce(jsonb_agg(jsonb_build_array(work_date,worker_id,role) order by work_date,worker_id),'[]') into old_rows from public.site_daily_assignments where company_id=p_company_id and site_id=p_site_id;
 select coalesce(jsonb_agg(jsonb_build_array(x->>'work_date',x->>'worker_id',x->>'role') order by x->>'work_date',x->>'worker_id'),'[]') into new_rows from jsonb_array_elements(p_rows) x;
 if not p_preview and old_rows is distinct from p_expected then raise exception '배정이 변경되었습니다. 다시 확인해주세요.'; end if;
 -- Estimate only the assignment-derived amount; manual costs/exclusions remain separate.
 with requested as (
 select 'before' kind,x->>0 work_day,(x->>1)::uuid worker,x->>2 role from jsonb_array_elements(old_rows) x
 union all select 'after',x->>0,(x->>1)::uuid,x->>2 from jsonb_array_elements(new_rows) x
 ), rated as (
 select r.kind,coalesce(s.daily_wage,case when rel.freelance then lp.daily_wage else w.daily_wage end) wage,
 case when r.role='leader' then coalesce(w.leader_allowance,0) else 0 end allowance
 from requested r join public.workers w on w.id=r.worker and w.company_id=p_company_id
 left join public.worker_assignment_wages s on s.company_id=p_company_id and s.site_id=p_site_id and s.worker_id=r.worker and s.work_date=r.work_day::date
 left join lateral(select exists(select 1 from public.worker_relationships wr where wr.company_id=p_company_id and wr.worker_id=r.worker and wr.relationship_type='freelancer' and wr.ended_at is null) freelance) rel on true
 left join public.labor_profiles lp on lp.user_id=w.user_id
 ) select coalesce(sum(wage+allowance) filter(where kind='before'),0),coalesce(sum(wage+allowance) filter(where kind='after'),0),count(*) filter(where wage is null or wage<=0) into before_cost,after_cost,unknown_count from rated;
 if p_preview then return jsonb_build_object('expected',old_rows,'beforeCost',before_cost,'afterCost',after_cost,'unknownRates',unknown_count); end if;
 if old_rows=new_rows then return jsonb_build_object('unchanged',true); end if;
 previous_batch:=current_setting('app.assignment_batch_site',true);
 perform set_config('app.assignment_batch_site',p_site_id::text,true);
 perform public.replace_site_daily_assignments(p_company_id,p_site_id,p_rows);
 perform set_config('app.assignment_batch_site',coalesce(previous_batch,''),true);
 insert into public.site_assignment_corrections(company_id,site_id,actor_id,reason,before_rows,after_rows) values(p_company_id,p_site_id,p_actor_id,btrim(p_reason),old_rows,new_rows);
 insert into public.site_change_events(company_id,site_id,message) values(p_company_id,p_site_id,'완료 현장 배정 정정 · '||btrim(p_reason));
 return jsonb_build_object('success',true);
end $$;
revoke all on function public.correct_completed_assignments(uuid,uuid,uuid,jsonb,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.correct_completed_assignments(uuid,uuid,uuid,jsonb,text,boolean,jsonb) to service_role;
