begin;
alter table public.worker_directory_consent add column if not exists reviewed_at timestamptz;
create table if not exists public.worker_directory_consent (
 user_id uuid primary key references public.labor_profiles(user_id) on delete cascade,
 visible boolean not null default false,
 updated_at timestamptz not null default now()
);
create table if not exists public.worker_connection_requests (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 created_by uuid not null references auth.users(id),
 target_user_id uuid not null references public.labor_profiles(user_id) on delete cascade,
 relationship_type text not null check(relationship_type in ('employee','freelancer')),
 message text not null default '' check(length(message)<=300),
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 unique(company_id,target_user_id)
);
create index if not exists worker_connection_inbox_idx on public.worker_connection_requests(target_user_id,updated_at desc);
create index if not exists worker_connection_company_idx on public.worker_connection_requests(company_id,updated_at desc);
alter table public.worker_directory_consent enable row level security;
alter table public.worker_connection_requests enable row level security;
revoke all on public.worker_directory_consent, public.worker_connection_requests from public,anon,authenticated;
grant select,insert,update on public.worker_directory_consent, public.worker_connection_requests to service_role;

create or replace function public.worker_directory_action(p_actor uuid,p_action text,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 co uuid; req public.worker_connection_requests%rowtype; target uuid; inv jsonb; result jsonb;
 q text; region_query text; skill_query text; page_no integer; min_exp integer; visible_now boolean;
begin
 if p_actor is null or exists(select 1 from public.profiles where id=p_actor and is_active=false) then
  raise exception '사용 가능한 계정으로 로그인해주세요.' using errcode='42501';
 end if;
 if p_action in ('search','sent','request','cancel') then
  select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id
   where p.id=p_actor and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
  if co is null then raise exception '활성 업체 관리자만 이용할 수 있습니다.' using errcode='42501'; end if;
 end if;
 if p_action='consent' then
  if jsonb_typeof(p_body->'visible') is distinct from 'boolean' then raise exception '공개 동의를 확인해주세요.' using errcode='22023'; end if;
  perform 1 from public.labor_profiles where user_id=p_actor;
  if not found then raise exception '기본 프로필을 먼저 저장해주세요.' using errcode='22023'; end if;
  visible_now:=(p_body->>'visible')::boolean;
  insert into public.worker_directory_consent(user_id,visible,reviewed_at) values(p_actor,visible_now,now())
   on conflict(user_id) do update set visible=excluded.visible,reviewed_at=now(),updated_at=now();
  if not visible_now then
   update public.worker_connection_requests set status='cancelled',revision=revision+1,updated_at=now()
    where target_user_id=p_actor and status='pending';
  end if;
  return jsonb_build_object('visible',visible_now);
 elsif p_action='mine' then
  return jsonb_build_object('visible',coalesce((select visible from public.worker_directory_consent where user_id=p_actor),true),
   'needs_review',false,
   'has_profile',exists(select 1 from public.labor_profiles where user_id=p_actor),
   'requests',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select r.id,r.relationship_type,r.message,r.status,r.revision,r.expires_at,r.updated_at,coalesce(to_jsonb(c)->>'company_name',to_jsonb(c)->>'name','업체') as company_name,c.is_active as company_active
    from public.worker_connection_requests r join public.companies c on c.id=r.company_id
    where r.target_user_id=p_actor order by r.updated_at desc limit 100
   ) x),'[]'::jsonb));
 elsif p_action='search' then
  page_no:=coalesce((p_body->>'page')::integer,0); min_exp:=coalesce((p_body->>'experience')::integer,0);
  if page_no not between 0 and 1000 or min_exp not between 0 and 70 then raise exception '검색 범위를 확인해주세요.' using errcode='22023'; end if;
  q:=btrim(coalesce(p_body->>'query','')); region_query:=btrim(coalesce(p_body->>'region','')); skill_query:=btrim(coalesce(p_body->>'skill',''));
  if length(q)>60 or length(region_query)>100 or length(skill_query)>40 then raise exception '검색어가 너무 깁니다.' using errcode='22023'; end if;
  return jsonb_build_object('profiles',coalesce((select jsonb_agg(to_jsonb(x) order by x.name,x.user_id) from (
    select lp.user_id,
     case when exists(select 1 from public.workers w where w.company_id=co and w.user_id=lp.user_id and w.is_active is distinct from false) then lp.name else left(lp.name,1)||repeat('○',greatest(char_length(lp.name)-2,1))||case when char_length(lp.name)>2 then right(lp.name,1) else '' end end as name,
     lp.region,lp.skills,lp.experience_years,lp.introduction,
     case when exists(select 1 from public.workers w where w.company_id=co and w.user_id=lp.user_id and w.is_active is distinct from false) then lp.daily_wage end as daily_wage,
     case when exists(select 1 from public.workers w where w.company_id=co and w.user_id=lp.user_id and w.is_active is distinct from false) then lp.photo_path end as photo_path,
     (lp.seeking and lp.published) as seeking,
     case when lp.seeking and lp.published then lp.available_dates else '{}'::date[] end as available_dates,

     exists(select 1 from public.workers w where w.company_id=co and w.user_id=lp.user_id and w.is_active is distinct from false) as connected,
     (select r.status from public.worker_connection_requests r where r.company_id=co and r.target_user_id=lp.user_id and r.expires_at>now()) as request_status
    from public.labor_profiles lp join public.worker_directory_consent dc on dc.user_id=lp.user_id and dc.visible=true and dc.reviewed_at is not null
    where lp.user_id<>p_actor and lp.experience_years>=min_exp
     and not exists(select 1 from public.profiles p where p.id=lp.user_id and p.is_active=false)
     and (q='' or strpos(lower(lp.name),lower(q))>0 or strpos(lower(left(lp.name,1)||repeat('○',greatest(char_length(lp.name)-2,1))||case when char_length(lp.name)>2 then right(lp.name,1) else '' end),lower(q))>0)
     and (coalesce(p_body->>'date','')='' or (lp.seeking and lp.published and (p_body->>'date')::date=any(lp.available_dates)))
     and (coalesce(p_body->>'wage','')='' or (exists(select 1 from public.workers w where w.company_id=co and w.user_id=lp.user_id and w.is_active is distinct from false) and lp.daily_wage<=(p_body->>'wage')::integer))
     and (region_query='' or strpos(lower(lp.region),lower(region_query))>0)
     and (skill_query='' or strpos(lower(array_to_string(lp.skills,' ')),lower(skill_query))>0)
    order by lp.name,lp.user_id offset page_no*30 limit 31
  ) x),'[]'::jsonb));
 elsif p_action='sent' then
  return jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
   select r.id,r.relationship_type,r.message,r.status,r.revision,r.expires_at,r.updated_at,
    case when exists(select 1 from public.workers w where w.company_id=co and w.user_id=lp.user_id and w.is_active is distinct from false) then lp.name when dc.visible then left(lp.name,1)||'○'||case when char_length(lp.name)>2 then right(lp.name,1) else '' end else '비공개 시공자' end as name
   from public.worker_connection_requests r join public.labor_profiles lp on lp.user_id=r.target_user_id
   left join public.worker_directory_consent dc on dc.user_id=lp.user_id
   where r.company_id=co order by r.updated_at desc limit 100
  ) x),'[]'::jsonb));
 elsif p_action='request' then
  target:=(p_body->>'target')::uuid;
  if target is null or target=p_actor or coalesce(p_body->>'relationshipType','') not in ('employee','freelancer') or length(coalesce(p_body->>'message',''))>300 then
   raise exception '연결 대상·유형·메시지를 확인해주세요.' using errcode='22023';
  end if;
  -- Lock consent before the request: withdrawal cancels pending requests atomically.
  perform 1 from public.worker_directory_consent where user_id=target and visible=true and reviewed_at is not null for update;
  if not found or exists(select 1 from public.profiles where id=target and is_active=false) then raise exception '현재 공개 중인 시공자가 아닙니다.' using errcode='42501'; end if;
  perform 1 from public.companies where id=co for update;
  if exists(select 1 from public.workers where company_id=co and user_id=target and is_active is distinct from false) then raise exception '이미 연결된 시공자입니다.' using errcode='40001'; end if;
  select * into req from public.worker_connection_requests where company_id=co and target_user_id=target for update;
  if found and req.status='pending' and req.expires_at>now() then return jsonb_build_object('status','pending'); end if;
  if req.id is not null and req.status='declined' and req.updated_at>now()-interval '7 days' then raise exception '거절된 요청은 7일 후 다시 보낼 수 있습니다.' using errcode='40001'; end if;
  if (select count(*) from public.worker_connection_requests where company_id=co and updated_at>now()-interval '1 day')>=30 then raise exception '하루 연결 요청은 최대 30건입니다.' using errcode='22023'; end if;
  insert into public.worker_connection_requests(company_id,created_by,target_user_id,relationship_type,message)
   values(co,p_actor,target,p_body->>'relationshipType',btrim(coalesce(p_body->>'message','')))
   on conflict(company_id,target_user_id) do update set created_by=p_actor,relationship_type=excluded.relationship_type,message=excluded.message,
    status='pending',revision=worker_connection_requests.revision+1,updated_at=now(),expires_at=now()+interval '7 days';
  return jsonb_build_object('status','pending');
 elsif p_action in ('accept','decline','cancel') then
  -- Read target, then use the same consent -> request locking order as request/withdrawal.
  select target_user_id into target from public.worker_connection_requests where id=(p_body->>'id')::uuid
   and (case when p_action='cancel' then company_id=co else target_user_id=p_actor end);
  if target is null then raise exception '본인에게 해당하는 요청만 처리할 수 있습니다.' using errcode='42501'; end if;
  perform 1 from public.worker_directory_consent where user_id=target for update;
  select * into req from public.worker_connection_requests where id=(p_body->>'id')::uuid for update;
  if (p_action='cancel' and req.company_id is distinct from co) or (p_action<>'cancel' and req.target_user_id<>p_actor) then raise exception '요청 권한이 없습니다.' using errcode='42501'; end if;
  if req.status<>'pending' or req.expires_at<=now() or req.revision is distinct from (p_body->>'revision')::integer then raise exception '이미 처리되었거나 변경·만료된 요청입니다. 새로고침해주세요.' using errcode='40001'; end if;
  if p_action='accept' then
   if p_body->'consent' is distinct from 'true'::jsonb then raise exception '업체 연결과 연락처 공유에 동의해주세요.' using errcode='22023'; end if;
   if not exists(select 1 from public.worker_directory_consent where user_id=p_actor and visible=true and reviewed_at is not null) then raise exception '공개를 해제한 요청은 수락할 수 없습니다.' using errcode='40001'; end if;
   perform 1 from public.profiles p join public.companies c on c.id=p.company_id
    where p.id=req.created_by and p.company_id=req.company_id and p.role='owner'
     and p.is_active is distinct from false and c.is_active=true for share of p,c;
   if not found then raise exception '요청한 업체 관리자의 권한이 변경되었습니다. 새 요청을 받아주세요.' using errcode='40001'; end if;
   if exists(select 1 from public.workers where company_id=req.company_id and user_id=p_actor and is_active is distinct from false) then raise exception '이미 연결된 업체입니다. 기존 요청을 거절하거나 관리자에게 확인해주세요.' using errcode='40001'; end if;
   inv:=public.direct_worker_invite_action(req.created_by,'create',null,req.relationship_type);
   result:=public.direct_worker_invite_action(p_actor,'accept',(inv->>'code')::uuid,null);
  end if;
  update public.worker_connection_requests set status=case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end,
   revision=revision+1,updated_at=now() where id=req.id;
  return jsonb_build_object('ok',true,'result',result);
 end if;
 raise exception '지원하지 않는 요청입니다.' using errcode='22023';
end $$;
revoke all on function public.worker_directory_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.worker_directory_action(uuid,text,jsonb) to service_role;

-- No prior choice: searchable by default. Preserve every saved exclusion.
alter table public.worker_directory_consent alter column visible set default true;
insert into public.worker_directory_consent(user_id,visible,reviewed_at)
 select user_id,true,now() from public.labor_profiles on conflict(user_id) do nothing;
update public.worker_directory_consent set reviewed_at=now() where reviewed_at is null;
create or replace function public.initialize_worker_directory()
returns trigger language plpgsql security invoker set search_path='' as $init$
begin
 insert into public.worker_directory_consent(user_id,visible,reviewed_at)
 values(new.user_id,true,now()) on conflict(user_id) do nothing;
 return new;
end $init$;
revoke all on function public.initialize_worker_directory() from public,anon,authenticated;
drop trigger if exists initialize_worker_directory on public.labor_profiles;
create trigger initialize_worker_directory after insert on public.labor_profiles
 for each row execute function public.initialize_worker_directory();

select '기본 검색 허용·개인설정 숨기기·실제 이름 검색 설정 완료' as result;
commit;
