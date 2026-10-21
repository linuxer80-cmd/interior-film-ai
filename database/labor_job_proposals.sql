-- labor_market_workflow.sql, labor_market_consistency.sql,
-- worker_relationships.sql 적용 후 실행. 운영 함수가 다르면 전체 롤백합니다.
begin;
alter table public.labor_jobs add column if not exists proposal_user_id uuid references auth.users(id);
alter table public.labor_jobs add column if not exists proposal_wage numeric;
create index if not exists labor_jobs_proposal_user_idx on public.labor_jobs(proposal_user_id) where proposal_user_id is not null;

-- 기존 배정의 충돌·일당 검증은 보존하고, 확정 날짜만 구직에서 뺍니다.
do $$
declare def text; oldpart text;
begin
 def:=pg_get_functiondef('public.labor_action(uuid,uuid,text,uuid)'::regprocedure);
 if position('proposal_remaining_dates_v1' in def)=0 then
  oldpart:=E'    update public.labor_profiles\n    set seeking=false,\n        direct_hire_consent=false,\n        updated_at=now()\n    where user_id=target;';
  if position(oldpart in def)=0 then raise exception '구인 함수 버전이 다릅니다. 기존 함수를 확인해주세요.'; end if;
  def:=replace(def,oldpart,E'    -- proposal_remaining_dates_v1\n    update public.labor_profiles remaining_profile\n    set available_dates=array(select d from unnest(remaining_profile.available_dates) d where d>=today and not(d=any(j.work_dates)) order by d),\n        seeking=remaining_profile.seeking and exists(select 1 from unnest(remaining_profile.available_dates) d where d>=today and not(d=any(j.work_dates))),\n        direct_hire_consent=remaining_profile.direct_hire_consent and exists(select 1 from unnest(remaining_profile.available_dates) d where d>=today and not(d=any(j.work_dates))),\n        updated_at=now()\n    where user_id=target;');
  execute def;
 end if;
end $$;

create or replace function public.create_labor_job_proposal(p_actor uuid,p_target uuid,p_job jsonb,p_expected_wage numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.labor_jobs; lp public.labor_profiles; jid uuid; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 select * into j from jsonb_populate_record(null::public.labor_jobs,p_job);
 if not exists(select 1 from public.profiles p join public.companies c on c.id=p.company_id where p.id=p_actor and p.role='owner' and p.is_active is distinct from false and c.is_active=true and c.id=j.company_id) then raise exception '관리자 권한이 필요합니다.'; end if;
 if p_target is null or p_target=p_actor then raise exception '제안할 시공자를 확인해주세요.'; end if;
 if not exists(select 1 from public.sites s where s.id=j.site_id and s.company_id=j.company_id and s.status not in ('cancelled','completed') and j.work_dates <@ s.work_dates) then raise exception '현장 시공일을 다시 확인해주세요.'; end if;
 if coalesce(cardinality(j.work_dates),0)=0 or exists(select 1 from unnest(j.work_dates) d where d<today) then raise exception '오늘 이후의 시공 날짜를 선택해주세요.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target::text,0));
 select * into lp from public.labor_profiles where user_id=p_target for update;
 if not found or not lp.seeking or not lp.published or not(j.work_dates <@ lp.available_dates) then raise exception '시공자의 공개 구직 날짜를 다시 확인해주세요.'; end if;
 if p_expected_wage is null or p_expected_wage<=0 or lp.daily_wage is distinct from p_expected_wage then raise exception '등록 일당이 변경되었습니다. 프로필을 새로고침해주세요.'; end if;
 if exists(select 1 from public.labor_jobs x where x.company_id=j.company_id and x.site_id=j.site_id and x.proposal_user_id=p_target and x.status='open' and x.work_dates && j.work_dates) then raise exception '이 날짜의 현장 제안이 이미 대기 중입니다.'; end if;
 insert into public.labor_jobs(company_id,created_by,title,region,address,work_content,work_date,end_date,daily_wage,headcount,skills,min_experience,min_age,max_age,worker_region,site_id,work_dates,proposal_user_id,proposal_wage)
 values(j.company_id,p_actor,j.title,j.region,j.region,j.work_content,j.work_date,j.end_date,p_expected_wage,1,coalesce(j.skills,'{}'),j.min_experience,j.min_age,j.max_age,coalesce(j.worker_region,''),j.site_id,j.work_dates,p_target,p_expected_wage) returning id into jid;
 perform public.labor_action(p_actor,jid,'invite',p_target);
 return jsonb_build_object('ok',true,'id',jid,'proposal',true);
end $$;

create or replace function public.reply_labor_job_proposal(p_actor uuid,p_job uuid,p_accept boolean,p_expected_wage numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.labor_jobs; a public.labor_applications; lp public.labor_profiles;
begin
 select * into j from public.labor_jobs where id=p_job for update;
 if not found or j.proposal_user_id is distinct from p_actor then raise exception '본인에게 온 현장 제안만 처리할 수 있습니다.'; end if;
 if p_accept is null then raise exception '수락 또는 거절을 선택해주세요.'; end if;
 select * into a from public.labor_applications where job_id=j.id and user_id=p_actor for update;
 if a.status='accepted' and p_accept then return jsonb_build_object('ok',true,'siteId',j.site_id); end if;
 if a.status='withdrawn' and not p_accept then return jsonb_build_object('ok',true); end if;
 if j.status<>'open' or a.status is distinct from 'invited' or j.end_date<(now() at time zone 'Asia/Seoul')::date then raise exception '이미 종료되거나 처리된 현장 제안입니다.'; end if;
 if not p_accept then
  perform public.labor_action(p_actor,j.id,'withdraw',null);
  update public.labor_jobs set status='closed' where id=j.id;
  insert into public.labor_notifications(user_id,job_id,title,message,link) values(j.created_by,j.id,'현장 제안 거절',j.title||' 현장 제안이 거절되었습니다.','/jobs?job='||j.id);
  return jsonb_build_object('ok',true);
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text,0));
 select * into lp from public.labor_profiles where user_id=p_actor for update;
 if coalesce(trim(lp.name),'')='' or coalesce(trim(lp.region),'')='' then raise exception '개인설정에서 이름과 활동 지역을 입력해주세요.'; end if;
 if p_expected_wage is null or j.proposal_wage is distinct from p_expected_wage or lp.daily_wage is distinct from j.proposal_wage then raise exception '등록 일당이 변경되었습니다. 업체에 새 제안을 요청해주세요.'; end if;
 if not(j.work_dates <@ lp.available_dates) then raise exception '일할 수 있는 날짜가 변경되었습니다. 구직 일정을 확인해주세요.'; end if;
 perform public.labor_action(p_actor,j.id,'apply',null);
 perform public.labor_action_registered_wage(j.created_by,j.id,'accept',p_actor,j.proposal_wage);
 insert into public.labor_notifications(user_id,job_id,title,message,link) values(j.created_by,j.id,'현장 제안 수락 · 배정 확정',j.title||' 제안이 수락되어 배정되었습니다.','/jobs?job='||j.id);
 return jsonb_build_object('ok',true,'siteId',j.site_id);
end $$;
create or replace function public.labor_proposal_capabilities()
returns jsonb language sql security invoker set search_path='' as $$select '{"version":1}'::jsonb$$;
revoke all on function public.create_labor_job_proposal(uuid,uuid,jsonb,numeric),public.reply_labor_job_proposal(uuid,uuid,boolean,numeric),public.labor_proposal_capabilities() from public,anon,authenticated;
grant execute on function public.create_labor_job_proposal(uuid,uuid,jsonb,numeric),public.reply_labor_job_proposal(uuid,uuid,boolean,numeric),public.labor_proposal_capabilities() to service_role;
notify pgrst,'reload schema';
commit;
