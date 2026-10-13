-- Direct company invitation without pre-registering a worker.
-- Run in Supabase SQL Editor before using the new invitation UI.
begin;
create table if not exists public.direct_worker_invitations (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 created_by uuid not null references auth.users(id),
 relationship_type text not null check (relationship_type in ('employee','freelancer')),
 status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
 accepted_user_id uuid references auth.users(id),
 expires_at timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now(),
 responded_at timestamptz
);
create index if not exists direct_worker_invitations_company_idx
 on public.direct_worker_invitations(company_id,created_at desc);
alter table public.direct_worker_invitations enable row level security;
revoke all on public.direct_worker_invitations from public,anon,authenticated;
grant select,insert,update on public.direct_worker_invitations to service_role;

create or replace function public.direct_worker_invite_action(
 p_actor uuid,p_action text,p_code uuid default null,p_type text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_company uuid; v_inv public.direct_worker_invitations%rowtype;
 v_worker public.workers%rowtype; v_name text; v_phone text; v_wage numeric;
 v_user auth.users%rowtype; v_company_name text;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then
  raise exception '인증된 계정으로 로그인해주세요.';
 end if;
 if p_action in ('create','list') then
  select p.company_id into v_company from public.profiles p
  join public.companies c on c.id=p.company_id
  where p.id=p_actor and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
  if v_company is null then raise exception '업체 관리자만 초대할 수 있습니다.'; end if;
  if p_action='list' then
   return jsonb_build_object('invites',coalesce((
    select jsonb_agg(jsonb_build_object('id',i.id,'relationshipType',i.relationship_type,
     'status',i.status,'createdAt',i.created_at,'expiresAt',i.expires_at,'respondedAt',i.responded_at)
     order by i.created_at desc)
    from public.direct_worker_invitations i where i.company_id=v_company
   ),'[]'::jsonb));
  end if;
  if p_type not in ('employee','freelancer') or p_type is null then raise exception '초대 유형을 선택해주세요.'; end if;
  insert into public.direct_worker_invitations(company_id,created_by,relationship_type)
   values(v_company,p_actor,p_type) returning * into v_inv;
  return jsonb_build_object('code',v_inv.id,'expiresAt',v_inv.expires_at);
 end if;
 if p_code is null then raise exception '초대 코드를 확인해주세요.'; end if;
 select * into v_inv from public.direct_worker_invitations where id=p_code for update;
 if not found then raise exception '초대를 찾을 수 없습니다.'; end if;
 select coalesce(to_jsonb(c)->>'company_name',to_jsonb(c)->>'name') into v_company_name
  from public.companies c where c.id=v_inv.company_id and c.is_active=true;
 if v_company_name is null then raise exception '활성 업체가 아닙니다.'; end if;
 if p_action='preview' then
  return jsonb_build_object('companyName',v_company_name,'relationshipType',v_inv.relationship_type,
   'status',v_inv.status,'expiresAt',v_inv.expires_at);
 end if;
 if v_inv.status<>'pending' or v_inv.expires_at<=now() then raise exception '이미 처리되었거나 만료된 초대입니다.'; end if;
 if p_action='decline' then
  update public.direct_worker_invitations set status='declined',accepted_user_id=p_actor,responded_at=now()
   where id=p_code;
  return jsonb_build_object('ok',true,'status','declined');
 end if;
 if p_action<>'accept' then raise exception '지원하지 않는 작업입니다.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text,0));
 select * into v_user from auth.users where id=p_actor;
 select lp.name, pd.phone, lp.daily_wage into v_name,v_phone,v_wage
  from public.labor_profiles lp left join public.labor_personal_details pd on pd.user_id=lp.user_id
  where lp.user_id=p_actor;
 if nullif(trim(coalesce(v_name,'')),'') is null or nullif(trim(coalesce(v_phone,'')),'') is null then
  raise exception '시공자 개인 프로필에서 이름과 연락처를 먼저 등록해주세요.';
 end if;
 if v_inv.relationship_type='freelancer' and coalesce(v_wage,0)<=0 then
  raise exception '프리랜서는 개인 프로필에 일당을 먼저 등록해주세요.';
 end if;
 select * into v_worker from public.workers where company_id=v_inv.company_id and user_id=p_actor for update;
 if found and v_worker.is_active=false then raise exception '비활성 시공자는 업체 관리자에게 문의해주세요.'; end if;
 if not found then
  insert into public.workers(company_id,user_id,name,phone,position,is_active,daily_wage)
  values(v_inv.company_id,p_actor,v_name,v_phone,'시공자',true,
   case when v_inv.relationship_type='freelancer' then v_wage else 0 end)
  returning * into v_worker;
 end if;
 if exists(select 1 from public.worker_relationships where worker_id=v_worker.id
    and (company_id<>v_inv.company_id or user_id<>p_actor)) then
  raise exception '기존 관계의 계정이 일치하지 않습니다.';
 end if;
 insert into public.worker_relationships(worker_id,company_id,user_id,relationship_type,accepted_at,ended_at)
 values(v_worker.id,v_inv.company_id,p_actor,v_inv.relationship_type,now(),null)
 on conflict(worker_id) do update set relationship_type=excluded.relationship_type,ended_at=null;
 update public.direct_worker_invitations set status='accepted',accepted_user_id=p_actor,responded_at=now()
 where id=p_code;
 return jsonb_build_object('ok',true,'status','accepted','workerId',v_worker.id,'companyName',v_company_name);
end $$;
revoke all on function public.direct_worker_invite_action(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.direct_worker_invite_action(uuid,text,uuid,text) to service_role;
commit;
