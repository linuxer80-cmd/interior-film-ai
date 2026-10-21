-- 기존 labor_job_proposals.sql 적용 후 실행합니다.
begin;
create or replace function public.reply_labor_job_proposal(p_actor uuid,p_job uuid,p_accept boolean,p_expected_wage numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.labor_jobs; a public.labor_applications; lp public.labor_profiles;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text,0));
 select * into j from public.labor_jobs where id=p_job for update;
 if not found or j.proposal_user_id is distinct from p_actor then raise exception '본인에게 온 현장 제안만 처리할 수 있습니다.'; end if;
 if p_accept is null then raise exception '지원 또는 거절을 선택해주세요.'; end if;
 select * into a from public.labor_applications where job_id=j.id and user_id=p_actor for update;
 if a.status='applied' and p_accept then return jsonb_build_object('ok',true,'applied',true); end if;
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
 return jsonb_build_object('ok',true,'applied',true);
end $$;

-- 제안 지원자도 업체 관리자가 선택한 뒤 최종 배정합니다.
create or replace function public.finalize_labor_job_proposal(
 p_actor uuid,p_job uuid,p_action text,p_target uuid,p_expected_wage numeric
)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.labor_jobs; lp public.labor_profiles;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target::text,0));
 select * into j from public.labor_jobs where id=p_job for update;
 if not found or p_action<>'accept' or j.proposal_user_id is distinct from p_target then raise exception '제안에 지원한 시공자를 확인해주세요.'; end if;
 if not exists(select 1 from public.profiles p join public.companies c on c.id=p.company_id where p.id=p_actor and p.role='owner' and p.is_active is distinct from false and c.is_active=true and c.id=j.company_id) then raise exception '본인 업체의 지원자만 확정할 수 있습니다.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target::text,0));
 select * into lp from public.labor_profiles where user_id=p_target for update;
 if p_expected_wage is null or p_expected_wage is distinct from j.proposal_wage or lp.daily_wage is distinct from j.proposal_wage then raise exception '제안 일당과 등록 일당이 달라졌습니다. 새 제안을 보내주세요.'; end if;
 if not(j.work_dates <@ lp.available_dates) then raise exception '지원자의 가능한 날짜가 변경되었습니다.'; end if;
 return public.labor_action_registered_wage(p_actor,p_job,p_action,p_target,p_expected_wage);
end $$;

-- 최종 배정 때만 같은 날짜의 다른 지원·제안을 만료합니다.
-- 공고 자체와 다른 지원자의 상태는 변경하지 않습니다.
do $$
declare def text; marker text; addition text;
begin
 def:=pg_get_functiondef('public.labor_action(uuid,uuid,text,uuid)'::regprocedure);
 if position('proposal_remaining_dates_v1' in def)=0 then raise exception '먼저 현장 제안 기본 SQL을 적용해주세요.'; end if;
 if position('proposal_lock_order_v2' in def)=0 then
  marker:=E'  select * into j\n  from public.labor_jobs';
  if position(marker in def)=0 then raise exception '구인 잠금 구문 버전이 다릅니다.'; end if;
  def:=replace(def,marker,E'  -- proposal_lock_order_v2\n  if p_action in (''accept'',''direct_hire'',''invite'',''reject'',''apply'',''withdraw'') then\n    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((case when p_action in (''accept'',''direct_hire'',''invite'',''reject'') then p_target else p_actor end)::text,0));\n  end if;\n  select * into j\n  from public.labor_jobs');
 end if;
 if position('proposal_competing_applications_v2' in def)=0 then
  marker:=E'    where user_id=target;\n\n  elsif p_action=''finish'' then';
  if position(marker in def)=0 then raise exception '구인 함수 버전이 다릅니다. 기존 함수를 확인해주세요.'; end if;
  addition:=E'    where user_id=target;\n\n    -- proposal_competing_applications_v2\n    insert into public.labor_notifications(user_id,job_id,title,message,link)\n    select target,other_job.id,''지원 일정 변경'', ''다른 현장 배정이 확정되어 겹치는 날짜의 지원·제안이 만료되었습니다.'', ''/jobs?view=worker&job=''||other_job.id\n    from public.labor_applications other_application join public.labor_jobs other_job on other_job.id=other_application.job_id\n    where other_application.user_id=target and other_job.id<>j.id and other_application.status in (''invited'',''applied'') and other_job.work_dates && j.work_dates;\n    update public.labor_applications other_application set status=''expired'',share_phone=false,updated_at=now()\n    from public.labor_jobs other_job where other_application.job_id=other_job.id and other_application.user_id=target and other_job.id<>j.id and other_application.status in (''invited'',''applied'') and other_job.work_dates && j.work_dates;\n\n  elsif p_action=''finish'' then';
  def:=replace(def,marker,addition);
 end if;
 execute def;
end $$;
create or replace function public.labor_proposal_capabilities()
returns jsonb language sql security invoker set search_path='' as $$select '{"version":2}'::jsonb$$;
revoke all on function public.reply_labor_job_proposal(uuid,uuid,boolean,numeric),public.finalize_labor_job_proposal(uuid,uuid,text,uuid,numeric),public.labor_proposal_capabilities() from public,anon,authenticated;
grant execute on function public.reply_labor_job_proposal(uuid,uuid,boolean,numeric),public.finalize_labor_job_proposal(uuid,uuid,text,uuid,numeric),public.labor_proposal_capabilities() to service_role;
notify pgrst,'reload schema';
commit;
select '제안 확인 → 지원 → 관리자 배정 확정 설정 완료' as result,public.labor_proposal_capabilities() as settings;
