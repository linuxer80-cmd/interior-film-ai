-- Run after labor_market_workflow.sql and labor_market_consistency.sql.
-- Additive: existing worker links and historical wages are not reclassified.
begin;
create table if not exists public.worker_relationships (
 worker_id uuid primary key references public.workers(id),
 company_id uuid not null references public.companies(id),
 user_id uuid not null references auth.users(id),
 relationship_type text not null check(relationship_type in ('employee','freelancer')),
 accepted_at timestamptz not null default now(),
 ended_at timestamptz
);
create table if not exists public.worker_relationship_invites (
 id uuid primary key default gen_random_uuid(),
 worker_id uuid not null references public.workers(id),
 company_id uuid not null references public.companies(id),
 relationship_type text not null check(relationship_type in ('employee','freelancer')),
 created_by uuid not null references auth.users(id),
 expected_user uuid references auth.users(id),
 claimant uuid references auth.users(id),
 claimant_email text,
 status text not null default 'pending' check(status in ('pending','requested','accepted','declined','cancelled')),
 expires_at timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now()
);
create unique index if not exists worker_relationship_invites_pending
 on public.worker_relationship_invites(worker_id) where status in ('pending','requested');
alter table public.worker_relationships enable row level security;
alter table public.worker_relationship_invites enable row level security;
revoke all on public.worker_relationships, public.worker_relationship_invites from public,anon,authenticated;
grant select,insert,update,delete on public.worker_relationships, public.worker_relationship_invites to service_role;

-- Only the authenticated server route may call this function with a verified actor.
create or replace function public.worker_relationship_action(p_actor uuid,p_action text,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 co uuid; w public.workers; inv public.worker_relationship_invites;
 target_user uuid; typ text; result jsonb;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor)
 or exists(select 1 from public.profiles where id=p_actor and is_active=false) then
  raise exception '로그인 상태를 확인해주세요.';
 end if;
 select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id
 where p.id=p_actor and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
 if p_action='mine' then
  return jsonb_build_object('relationships',coalesce((select jsonb_agg(to_jsonb(r)) from public.worker_relationships r
    join public.workers linked on linked.id=r.worker_id and linked.user_id=r.user_id and linked.is_active=true
    where r.user_id=p_actor and r.ended_at is null),'[]'::jsonb));
 end if;
 if p_action in ('list','invite','approve','cancel','end') and co is null then raise exception '관리자 권한이 필요합니다.'; end if;
 if p_action='list' then
  return jsonb_build_object('relationships',coalesce((select jsonb_agg(to_jsonb(r)) from public.worker_relationships r where company_id=co),'[]'::jsonb),
   'invites',coalesce((select jsonb_agg(to_jsonb(i)) from public.worker_relationship_invites i where company_id=co and status in ('pending','requested') and expires_at>now()),'[]'::jsonb));
 end if;
 if p_action in ('invite','end') then
  select * into w from public.workers where id=(p_body->>'workerId')::uuid and company_id=co for update;
  if not found then raise exception '본인 업체의 시공자를 선택해주세요.'; end if;
  if p_action='end' then
   update public.workers set is_active=false where id=w.id;
   update public.worker_relationships set ended_at=now() where worker_id=w.id;
   update public.worker_relationship_invites set status='cancelled' where worker_id=w.id and status in ('pending','requested');
   return jsonb_build_object('ok',true);
  end if;
  if w.is_active is not true then raise exception '거래 종료된 시공자는 먼저 활성화해주세요.'; end if;
  typ:=p_body->>'relationshipType';
  if typ is null or typ not in ('employee','freelancer') then raise exception '직원 또는 협력 시공자를 선택해주세요.'; end if;
  update public.worker_relationship_invites set status='cancelled' where worker_id=w.id and status in ('pending','requested');
  insert into public.worker_relationship_invites(worker_id,company_id,relationship_type,created_by,expected_user)
  values(w.id,co,typ,p_actor,w.user_id) returning * into inv;
  return jsonb_build_object('code',inv.id,'expiresAt',inv.expires_at);
 end if;
 -- All invitation actions lock the worker first, then the invitation: consistent with invite/end.
 select worker_id into target_user from public.worker_relationship_invites where id=(p_body->>'code')::uuid;
 select * into w from public.workers where id=target_user for update;
 select * into inv from public.worker_relationship_invites where id=(p_body->>'code')::uuid for update;
 if not found or inv.company_id is distinct from w.company_id then raise exception '초대를 찾을 수 없습니다.'; end if;
 if p_action in ('approve','cancel') and inv.company_id is distinct from co then raise exception '본인 업체의 초대만 처리할 수 있습니다.'; end if;
 if p_action='cancel' then
  update public.worker_relationship_invites set status='cancelled' where id=inv.id and status in ('pending','requested');
  return jsonb_build_object('ok',true);
 end if;
 if inv.expires_at<=now() or inv.status not in ('pending','requested') or w.is_active is not true
 or not exists(select 1 from public.companies where id=inv.company_id and is_active=true) then raise exception '만료되었거나 종료된 초대입니다.'; end if;
 if p_action in ('preview','accept','decline') then
  if inv.expected_user is not null and inv.expected_user<>p_actor then raise exception '초대받은 계정으로 로그인해주세요.'; end if;
  if inv.claimant is not null and inv.claimant<>p_actor then raise exception '다른 계정에서 확인 중인 초대입니다.'; end if;
 end if;
 if p_action='preview' then
  select jsonb_build_object('companyName',coalesce(to_jsonb(c)->>'name',to_jsonb(c)->>'company_name','업체'),
   'workerName',w.name,'relationshipType',inv.relationship_type,'status',inv.status,'expiresAt',inv.expires_at)
  into result from public.companies c where id=inv.company_id;
  return result;
 elsif p_action='decline' then
  update public.worker_relationship_invites set status='declined',claimant=p_actor where id=inv.id;
  return jsonb_build_object('ok',true);
 elsif p_action='accept' then
  -- Email is supplied by the server from auth.getUser(), never from client input.
  update public.worker_relationship_invites set status='requested',claimant=p_actor,claimant_email=left(p_body->>'verifiedEmail',254) where id=inv.id;
  return jsonb_build_object('ok',true,'awaitingApproval',true);
 elsif p_action='approve' then
  if inv.status<>'requested' or inv.claimant is null then raise exception '시공자가 먼저 초대를 수락해야 합니다.'; end if;
  target_user:=inv.claimant;
  if exists(select 1 from public.profiles where id=target_user and is_active=false) then raise exception '사용이 중지된 계정입니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user::text,0));
  if w.user_id is not null and w.user_id<>target_user then raise exception '이미 다른 계정에 연결된 시공자입니다.'; end if;
  if exists(select 1 from public.workers where company_id=co and user_id=target_user and id<>w.id) then
   raise exception '이 계정은 이미 업체 명단에 있습니다. 기존 시공자 기록에서 초대해주세요.';
  end if;
  if inv.relationship_type='freelancer' and not exists(select 1 from public.labor_profiles where user_id=target_user and daily_wage>0) then
   raise exception '시공자가 내 프로필에 일당을 먼저 등록해야 합니다.';
  end if;
  update public.workers set user_id=target_user where id=w.id;
  insert into public.worker_relationships(worker_id,company_id,user_id,relationship_type)
  values(w.id,co,target_user,inv.relationship_type)
  on conflict(worker_id) do update set user_id=excluded.user_id,relationship_type=excluded.relationship_type,accepted_at=now(),ended_at=null;
  update public.worker_relationship_invites set status='accepted' where id=inv.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception '지원하지 않는 요청입니다.';
end $$;
revoke all on function public.worker_relationship_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.worker_relationship_action(uuid,text,jsonb) to service_role;


alter table public.labor_applications add column if not exists accepted_daily_wage numeric;
alter table public.labor_applications add column if not exists accepted_work_dates date[];
alter table public.labor_applications add column if not exists accepted_site_id uuid references public.sites(id);
create table if not exists public.worker_assignment_wages (
 company_id uuid not null references public.companies(id),
 worker_id uuid not null references public.workers(id),
 site_id uuid not null references public.sites(id),
 work_date date not null,
 daily_wage numeric not null check(daily_wage>0 and daily_wage<=100000000),
 confirmed_at timestamptz not null default now(),
 primary key(company_id,worker_id,site_id,work_date)
);
alter table public.worker_assignment_wages enable row level security;
revoke all on public.worker_assignment_wages from public,anon,authenticated;
grant select,insert,update,delete on public.worker_assignment_wages to service_role;
create schema if not exists app_private;
create or replace function app_private.capture_worker_assignment_wage()
returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid; amount numeric;
begin
 if not exists(select 1 from public.worker_relationships where worker_id=new.worker_id and company_id=new.company_id and relationship_type='freelancer' and ended_at is null) then return new; end if;
 -- Trigger-only access: authenticated assignment changes must belong to an active owner.
 if auth.uid() is not null and not exists(select 1 from public.profiles p join public.companies c on c.id=p.company_id
  where p.id=auth.uid() and p.role='owner' and p.is_active is distinct from false and c.is_active=true and c.id=new.company_id) then
  raise exception '업체 관리자만 배정 일당을 확정할 수 있습니다.';
 end if;
 if not exists(select 1 from public.sites where id=new.site_id and company_id=new.company_id) then raise exception '현장 업체를 확인해주세요.'; end if;
 select user_id into uid from public.workers where id=new.worker_id and company_id=new.company_id and is_active=true;
 if uid is null then raise exception '연결된 활성 시공자를 확인해주세요.'; end if;
 -- Re-saving or restoring the same assignment never reprices a confirmed day.
 if exists(select 1 from public.worker_assignment_wages where company_id=new.company_id and worker_id=new.worker_id and site_id=new.site_id and work_date=new.work_date) then return new; end if;
 select daily_wage into amount from public.labor_profiles where user_id=uid for share;
 if amount is null or amount<=0 or amount>100000000 then raise exception '시공자가 등록 일당을 먼저 입력해야 합니다.'; end if;
 insert into public.worker_assignment_wages(company_id,worker_id,site_id,work_date,daily_wage)
 values(new.company_id,new.worker_id,new.site_id,new.work_date,amount) on conflict do nothing;
 return new;
end $$;
revoke all on function app_private.capture_worker_assignment_wage() from public,anon,authenticated;
drop trigger if exists capture_worker_assignment_wage on public.site_daily_assignments;
create trigger capture_worker_assignment_wage after insert or update of company_id,site_id,worker_id,work_date
 on public.site_daily_assignments for each row execute function app_private.capture_worker_assignment_wage();

-- Carefully patch the known function, retaining deployed consistency fixes.
do $$
declare def text; oldpart text; newpart text;
begin
 def:=pg_get_functiondef('public.labor_action(uuid,uuid,text,uuid)'::regprocedure);
 if position('registered_wage_v1' in def)=0 then
  oldpart:=E'      if j.daily_wage is not null and j.daily_wage<lp.daily_wage then\n        raise exception ''희망 일당 이상의 현장을 선택해주세요.'';\n      end if;';
  if position(oldpart in def)=0 then raise exception '구인 함수 버전이 다릅니다. 기존 함수를 확인해주세요.'; end if;
  def:=replace(def,oldpart,'      -- 모집 기준 일당은 지급 상한이 아닙니다.');
  oldpart:=E'    select id into wid\n    from public.workers';
  newpart:=E'    -- registered_wage_v1: lock and verify the amount the owner reviewed.\n    select * into lp from public.labor_profiles where user_id=target for update;\n    if lp.daily_wage is null or lp.daily_wage<=0 then raise exception ''시공자가 등록 일당을 먼저 입력해야 합니다.''; end if;\n    if lp.daily_wage is distinct from nullif(current_setting(''app.expected_worker_wage'',true),'''')::numeric then\n      raise exception ''시공자 일당이 변경되었습니다. 프로필을 새로고침하고 다시 확인해주세요.'';\n    end if;\n    select id into wid\n    from public.workers';
  if position(oldpart in def)=0 then raise exception '시공자 조회 구문이 다릅니다.'; end if;
  def:=replace(def,oldpart,newpart);
  def:=replace(def,'coalesce(j.daily_wage,lp.daily_wage)','lp.daily_wage');
  oldpart:=E'    insert into public.site_workers(';
  newpart:=E'    if exists(select 1 from public.worker_relationships where worker_id=wid and relationship_type=''employee'' and ended_at is null) then\n      raise exception ''소속 직원은 직원 급여 기준으로 현장에서 직접 배정해주세요.'';\n    end if;\n    insert into public.worker_relationships(worker_id,company_id,user_id,relationship_type)\n    values(wid,j.company_id,target,''freelancer'') on conflict(worker_id) do update set ended_at=null;\n\n    insert into public.site_workers(';
  if position(oldpart in def)=0 then raise exception '현장 배정 구문이 다릅니다.'; end if;
  def:=replace(def,oldpart,newpart);
  oldpart:=E'    set status=''accepted'',\n        updated_at=now()';
  newpart:=E'    set status=''accepted'',\n        accepted_daily_wage=lp.daily_wage,\n        accepted_work_dates=j.work_dates,\n        accepted_site_id=j.site_id,\n        updated_at=now()';
  if position(oldpart in def)=0 then raise exception '채용 확정 구문이 다릅니다.'; end if;
  def:=replace(def,oldpart,newpart);
  execute def;
 end if;
end $$;
create or replace function public.labor_action_registered_wage(p_actor uuid,p_job uuid,p_action text,p_target uuid,p_expected_wage numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; prior text;
begin
 if p_action not in ('accept','direct_hire') or p_expected_wage is null or p_expected_wage<=0 or p_expected_wage>100000000 then raise exception '적용할 등록 일당을 확인해주세요.'; end if;
 prior:=current_setting('app.expected_worker_wage',true);
 perform set_config('app.expected_worker_wage',p_expected_wage::text,true);
 result:=public.labor_action(p_actor,p_job,p_action,p_target);
 perform set_config('app.expected_worker_wage',coalesce(prior,''),true);
 return result;
end $$;
create or replace function public.create_labor_direct_job_registered_wage(p_actor uuid,p_target uuid,p_job jsonb,p_expected_wage numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; prior text;
begin
 if p_expected_wage is null or p_expected_wage<=0 or p_expected_wage>100000000 then raise exception '적용할 등록 일당을 확인해주세요.'; end if;
 prior:=current_setting('app.expected_worker_wage',true);
 perform set_config('app.expected_worker_wage',p_expected_wage::text,true);
 result:=public.create_labor_direct_job(p_actor,p_target,p_job);
 perform set_config('app.expected_worker_wage',coalesce(prior,''),true);
 return result;
end $$;
revoke all on function public.labor_action_registered_wage(uuid,uuid,text,uuid,numeric),public.create_labor_direct_job_registered_wage(uuid,uuid,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.labor_action_registered_wage(uuid,uuid,text,uuid,numeric),public.create_labor_direct_job_registered_wage(uuid,uuid,jsonb,numeric) to service_role;
commit;
