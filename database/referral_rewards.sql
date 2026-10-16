-- Run once in Supabase SQL Editor. Safe to rerun; existing awards are credited once.
begin;
grant select(id,email_confirmed_at,is_anonymous,created_at) on auth.users to service_role;
create table if not exists public.app_referrals (
 id uuid primary key default gen_random_uuid(),
 token text not null unique default replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
 inviter uuid not null references auth.users(id),
 subject_key text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 days',
 shared_at timestamptz,
 recipient uuid unique references auth.users(id),
 joined_at timestamptz,
 check(recipient is null or recipient<>inviter)
);
create index if not exists app_referrals_subject on public.app_referrals(subject_key);
create table if not exists public.badge_ai_credits (
 subject_key text not null, badge_id text not null references public.achievement_definitions(id),
 feature text not null, granted integer not null check(granted>0), used integer not null default 0 check(used>=0 and used<=granted),
 granted_at timestamptz not null default now(), primary key(subject_key,badge_id,feature)
);
create table if not exists public.badge_ai_requests (
 request_id uuid primary key, company_id uuid not null, actor uuid, feature text not null, units integer not null,
 created_at timestamptz not null default now()
);
alter table public.app_referrals enable row level security;
alter table public.badge_ai_credits enable row level security;
alter table public.badge_ai_requests enable row level security;
revoke all on public.app_referrals,public.badge_ai_credits,public.badge_ai_requests from public,anon,authenticated;
grant select,insert,update on public.app_referrals,public.badge_ai_credits,public.badge_ai_requests to service_role;

create or replace function public.badge_reward_spec(p_metric text,p_target integer,p_tier text)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select case
 when p_metric='worker_referral_joined' and p_target>=10 then '{"cutting_ocr":13}'::jsonb
 when p_metric='worker_referral_joined' then '{"cutting_ocr":8}'::jsonb
 when p_metric='worker_referral_shared' then '{"cutting_ocr":5}'::jsonb
 when p_metric='returned_sites' then '{"cutting_ocr":3}'::jsonb
 when p_metric like '%referral_joined' and p_target>=10 then '{"ai_photo_analysis":8,"similar_image_search":5,"virtual_remodel":1}'::jsonb
 when p_metric like '%referral_joined' then '{"ai_photo_analysis":5,"similar_image_search":3}'::jsonb
 when p_metric like '%referral_shared' then '{"ai_photo_analysis":3,"similar_image_search":2}'::jsonb
 when p_metric in ('ai_cutting','cutting_days') then '{"cutting_ocr":3}'::jsonb
 when p_metric in ('ai_receipt','returned_sites','settled_sites','nearby_film_days') then '{"receipt_ocr":3}'::jsonb
 when p_metric='ai_search' then '{"similar_image_search":3}'::jsonb
 when p_metric='ai_virtual' then '{"virtual_remodel":1}'::jsonb
 when p_metric='ai_consult' then '{"consultation_ocr":3}'::jsonb
 when p_metric='ai_voice' then '{"voice_transcription":3}'::jsonb
 when p_metric='ai_quick' then '{"quick_photo_analysis":3}'::jsonb
 when p_metric in ('ai_photo','registered_sites','approved_sites','approved_reports') then '{"ai_photo_analysis":3}'::jsonb
 when p_metric in ('nearby_food_days','attendance_days','attendance_sites','commute_trips','commute_km','departure_registered','complete_profile','member_days') then '{"cutting_ocr":2}'::jsonb
 else '{"ai_photo_analysis":2}'::jsonb end;
$$;
create or replace function public.grant_badge_ai_credit()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.badge_ai_credits(subject_key,badge_id,feature,granted)
 select new.subject_key,new.badge_id,e.key,e.value::integer
 from public.achievement_definitions d cross join lateral jsonb_each_text(public.badge_reward_spec(d.metric,d.target,d.tier)) e
 where d.id=new.badge_id on conflict do nothing;
 return new;
end $$;
drop trigger if exists badge_ai_credit_awarded on public.achievement_awards;
create trigger badge_ai_credit_awarded after insert on public.achievement_awards for each row execute function public.grant_badge_ai_credit();
insert into public.badge_ai_credits(subject_key,badge_id,feature,granted)
select a.subject_key,a.badge_id,e.key,e.value::integer from public.achievement_awards a
join public.achievement_definitions d on d.id=a.badge_id
cross join lateral jsonb_each_text(public.badge_reward_spec(d.metric,d.target,d.tier)) e on conflict do nothing;

create or replace function public.referral_subject(p_actor uuid,p_scope text)
returns text language plpgsql security invoker set search_path='' as $$
declare co uuid;
begin
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null and coalesce(is_anonymous,false)=false)
 or exists(select 1 from public.profiles where id=p_actor and is_active=false) then raise exception '이메일 인증된 활성 계정이 필요합니다.' using errcode='42501'; end if;
 if p_scope='worker' then return 'user:'||p_actor::text; end if;
 if p_scope='owner' then
 select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id
 where p.id=p_actor and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
 if co is not null then return 'company:'||co::text; end if;
 end if;
 raise exception '업적 대상을 확인해주세요.' using errcode='42501';
end $$;
create or replace function public.referral_metrics(p_subject text,p_scope text)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(p_scope||'_referral_shared',count(*) filter(where recipient is not null),p_scope||'_referral_joined',count(*) filter(where joined_at is not null))
 from public.app_referrals where subject_key=p_subject;
$$;
-- Extend installed metric checks without dropping support for any existing metric.
do $patch$
declare c record; source text;
begin
 for c in select conname,pg_get_constraintdef(oid) as def from pg_constraint
 where conrelid='public.achievement_definitions'::regclass and contype='c'
 and (select attnum from pg_attribute where attrelid=conrelid and attname='metric')=any(conkey)
 loop
 if position('referral_shared' in c.def)=0 then
 execute format('alter table public.achievement_definitions drop constraint %I',c.conname);
 execute format('alter table public.achievement_definitions add constraint %I check ((%s) or (audience=''owner'' and metric in (''owner_referral_shared'',''owner_referral_joined'')) or (audience=''worker'' and metric in (''worker_referral_shared'',''worker_referral_joined'')))',c.conname,substring(c.def from 8 for length(c.def)-8));
 end if;
 end loop;
 source:=pg_get_functiondef('public.achievement_action(uuid,text,jsonb)'::regprocedure);
 if position('public.referral_metrics' in source)=0 then
 if (select count(*) from regexp_matches(source,'for\s+badge\s+in','gi'))<>1 then raise exception '기존 업적 함수 구조를 확인해주세요.'; end if;
 execute regexp_replace(source,'for\s+badge\s+in',E'metrics := metrics || public.referral_metrics(subject,scope);\n for badge in','i');
 end if;
end $patch$;
insert into public.achievement_definitions(id,title,description,audience,metric,target,art_key,tier,sort_order)
select scope||'_invite_'||kind||'_'||goal,
 case when kind='shared' then '초대의 손길 ' else '함께하는 친구 ' end||goal||'명',
 case when kind='shared' then '서로 다른 계정의 로그인·이메일 인증 후 초대 확인 ' else '일회용 링크로 신규 가입·이메일 인증 완료 ' end||goal||'명',
 scope,scope||'_referral_'||kind,goal,case when kind='shared' then 3 else 6 end,
 case when goal>=10 then 'gold' when goal>=3 then 'silver' else 'bronze' end,500+goal+case when kind='joined' then 100 else 0 end
from unnest(array['owner','worker']) scope cross join unnest(array['shared','joined']) kind cross join unnest(array[1,3,5,10,20,50]) goal
on conflict(id) do nothing;

create or replace function public.referral_action(p_actor uuid,p_action text,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare subject text; r public.app_referrals%rowtype; joined timestamptz; result jsonb;
begin
 subject:=public.referral_subject(p_actor,coalesce(p_body->>'scope','worker'));
 perform pg_advisory_xact_lock(hashtextextended('referral-user:'||p_actor::text,0));
 if p_action='create' then
  -- Reuse an unshared link after a retry. Link generation itself earns nothing.
  select * into r from public.app_referrals where inviter=p_actor and subject_key=subject and shared_at is null and recipient is null and expires_at>now() order by created_at desc limit 1;
  if r.id is null then
   if (select count(*) from public.app_referrals where inviter=p_actor and created_at>=now()-interval '1 day')>=20 then raise exception '초대 링크는 하루 20개까지 만들 수 있습니다.' using errcode='22023'; end if;
   insert into public.app_referrals(inviter,subject_key) values(p_actor,subject) returning * into r;
  end if;
  return jsonb_build_object('token',r.token,'expires_at',r.expires_at);
 elsif p_action='shared' then
  update public.app_referrals set shared_at=coalesce(shared_at,now()) where token=p_body->>'token' and inviter=p_actor and subject_key=subject and expires_at>now() returning * into r;
  if r.id is null then raise exception '초대 링크를 다시 만들어주세요.' using errcode='22023'; end if;
 elsif p_action='claim' then
  select * into r from public.app_referrals where token=p_body->>'token' for update;
  if r.id is null then raise exception '유효하지 않은 초대 링크입니다.' using errcode='22023'; end if;
  if r.recipient=p_actor then return jsonb_build_object('ok',true,'message','이미 초대 확인이 인정되었습니다.'); end if;
  select created_at into joined from auth.users where id=p_actor;
  if r.inviter=p_actor or r.recipient is not null or r.expires_at<=now() then
   raise exception '본인 초대이거나 이미 사용되었거나 만료된 링크입니다.' using errcode='22023';
  end if;
  if exists(select 1 from public.app_referrals where recipient=p_actor) then raise exception '이미 초대가 인정된 계정입니다. 같은 계정은 한 번만 인정됩니다.' using errcode='22023'; end if;
  update public.app_referrals set recipient=p_actor,joined_at=case when joined>=r.created_at then now() else null end,shared_at=coalesce(shared_at,now()) where id=r.id;
 elsif p_action<>'get' then raise exception '지원하지 않는 초대 요청입니다.' using errcode='22023'; end if;
 return jsonb_build_object('ok',true,'confirmation_version',2,'metrics',public.referral_metrics(subject,coalesce(p_body->>'scope','worker')),
 'links',coalesce((select jsonb_agg(to_jsonb(x)) from (select token,created_at,expires_at,shared_at,joined_at,(recipient is not null) as confirmed from public.app_referrals where inviter=p_actor and subject_key=subject order by created_at desc limit 10)x),'[]'::jsonb));
end $$;

-- Called only after achievement_action has authorized its scope.
create or replace function public.badge_reward_status(p_actor uuid,p_scope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare subject text;
begin
 subject:=public.referral_subject(p_actor,p_scope);
 return jsonb_build_object('credits',coalesce((select jsonb_agg(to_jsonb(c)) from (select badge_id,feature,granted,used from public.badge_ai_credits where subject_key=subject)c),'[]'::jsonb),
 'specs',coalesce((select jsonb_object_agg(id,public.badge_reward_spec(metric,target,tier)) from public.achievement_definitions where audience=p_scope),'{}'::jsonb));
end $$;

-- Preserve base quota rules and use a separate, non-renewing reward ledger.
create or replace function public.reserve_ai_with_badges(p_company_id uuid,p_actor uuid,p_request_id uuid,p_feature text,p_units integer,p_reserve boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare base jsonb; prior public.badge_ai_requests%rowtype; available bigint; left_units integer; take_units integer; credit record; scope text;
begin
 if p_request_id is null or p_units is null or p_units not between 1 and 30 then return jsonb_build_object('ok',false,'error','요청 수량을 확인해주세요.'); end if;
 -- Global reward lock serializes spending across companies for personal rewards.
 perform pg_advisory_xact_lock(hashtextextended('badge-ai-spend',0));
 perform pg_advisory_xact_lock(hashtextextended('badge-ai-request:'||p_request_id::text,0));
 select * into prior from public.badge_ai_requests where request_id=p_request_id;
 if found then
  if prior.company_id is distinct from p_company_id or prior.actor is distinct from p_actor or prior.feature<>p_feature or prior.units<>p_units then return jsonb_build_object('ok',false,'error','요청 정보가 일치하지 않습니다.'); end if;
  return jsonb_build_object('ok',true,'reused',true,'reward',true);
 end if;
 base:=public.reserve_ai_feature_quota(p_company_id,p_request_id,p_feature,p_units,false);
 if coalesce((base->>'ok')::boolean,false) then
  if p_reserve then return public.reserve_ai_feature_quota(p_company_id,p_request_id,p_feature,p_units,true); end if;
  return base;
 end if;
 -- Only a real count exhaustion is eligible. Never bypass account/plan validation.
 if not ((base ? 'used' and base ? 'limit') or base->>'error'='이 요금제에서는 해당 AI 기능을 사용할 수 없습니다.') or not exists(select 1 from public.companies c join public.subscription_plans p on lower(p.plan_code)=lower(c.subscription_plan) where c.id=p_company_id and c.is_active=true and lower(c.subscription_plan)='trial' and p.is_active is distinct from false) then return base; end if;
 scope:='company:'||p_company_id::text;
 select coalesce(sum(granted-used),0) into available from public.badge_ai_credits
 where feature=p_feature and (subject_key=scope or (p_actor is not null and subject_key='user:'||p_actor::text));
 if available<p_units then return base||jsonb_build_object('reward_remaining',available); end if;
 if not p_reserve then return jsonb_build_object('ok',true,'reward',true,'remaining',available); end if;
 left_units:=p_units;
 for credit in select * from public.badge_ai_credits where feature=p_feature and used<granted
 and (subject_key=scope or (p_actor is not null and subject_key='user:'||p_actor::text)) order by granted_at,subject_key,badge_id for update loop
 take_units:=least(left_units,credit.granted-credit.used);
 update public.badge_ai_credits set used=used+take_units where subject_key=credit.subject_key and badge_id=credit.badge_id and feature=credit.feature;
 left_units:=left_units-take_units; exit when left_units=0;
 end loop;
 insert into public.badge_ai_requests(request_id,company_id,actor,feature,units) values(p_request_id,p_company_id,p_actor,p_feature,p_units);
 insert into public.ai_quota_periods(scope_key,feature,period_start,used) values(p_company_id::text,p_feature,'1970-01-01',0) on conflict do nothing;
 insert into public.ai_quota_requests(request_id,scope_key,feature,period_start,units) values(p_request_id,p_company_id::text,p_feature,'1970-01-01',p_units);
 return jsonb_build_object('ok',true,'reward',true,'remaining',available-p_units);
end $$;

do $privileges$
declare f text;
begin
 foreach f in array array['badge_reward_spec(text,integer,text)','grant_badge_ai_credit()','referral_subject(uuid,text)','referral_metrics(text,text)','referral_action(uuid,text,jsonb)','badge_reward_status(uuid,text)','reserve_ai_with_badges(uuid,uuid,uuid,text,integer,boolean)'] loop
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';
 execute 'grant execute on function public.'||f||' to service_role';
 end loop;
end $privileges$;
notify pgrst,'reload schema';
commit;
select '초대 배지·AI 보상 설정 완료' as result,count(*) as invitation_badges from public.achievement_definitions where metric like '%referral_%';
