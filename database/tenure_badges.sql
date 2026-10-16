begin;

-- 가입일 조회에 필요한 열만 서버 역할에 허용합니다.
grant usage on schema auth to service_role;
grant select(id,created_at) on auth.users to service_role;
grant select(id,created_at) on public.companies to service_role;

create or replace function public.achievement_tenure_metrics(p_actor uuid,p_scope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare joined_at timestamptz; days integer;
begin
 if p_scope='worker' then
  select u.created_at into joined_at from auth.users u where u.id=p_actor;
 elsif p_scope='owner' then
  select c.created_at into joined_at
  from public.profiles p join public.companies c on c.id=p.company_id
  where p.id=p_actor and p.role='owner'
   and p.is_active is distinct from false and c.is_active=true;
 else
  raise exception '업적 대상을 확인해주세요.' using errcode='22023';
 end if;
 days:=greatest(0,coalesce(
  (now() at time zone 'Asia/Seoul')::date-
  (joined_at at time zone 'Asia/Seoul')::date,0));
 return jsonb_build_object(
  case when p_scope='worker' then 'member_days' else 'company_days' end,days);
end $$;

revoke all on function public.achievement_tenure_metrics(uuid,text)
 from public,anon,authenticated;
grant execute on function public.achievement_tenure_metrics(uuid,text)
 to service_role;

do $constraints$
declare item record;
begin
 for item in select c.conname from pg_constraint c
 where c.conrelid='public.achievement_definitions'::regclass and c.contype='c'
 and (select a.attnum from pg_attribute a where a.attrelid=c.conrelid and a.attname='metric')=any(c.conkey)
 loop execute format('alter table public.achievement_definitions drop constraint %I',item.conname); end loop;
end $constraints$;

alter table public.achievement_definitions add constraint achievement_metric_audience_check check(
 (audience='owner' and metric in ('company_days','ai_photo','ai_search','ai_virtual','ai_cutting','ai_receipt','ai_consult','ai_voice','ai_quick','ai_variety','registered_sites','approved_sites','settled_sites','connected_workers'))
 or (audience='worker' and metric in ('member_days','cutting_days','nearby_food_days','nearby_film_days','departure_registered','commute_trips','commute_km','attendance_days','attendance_sites','complete_profile','approved_reports','returned_sites'))
);

do $patch$
declare source text;
begin
 source:=pg_get_functiondef('public.achievement_action(uuid,text,jsonb)'::regprocedure);
 if position('achievement_tenure_metrics' in source)=0 then
  if (select count(*) from regexp_matches(source,'for\s+badge\s+in','gi'))<>1 then
   raise exception '업적 함수 구조 확인이 필요합니다.';
  end if;
  execute regexp_replace(source,'for\s+badge\s+in',
   E'metrics := metrics || public.achievement_tenure_metrics(p_actor,scope);\n for badge in','i');
 end if;
end $patch$;

revoke all on function public.achievement_action(uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.achievement_action(uuid,text,jsonb)
 to service_role;

insert into public.achievement_definitions
(id,title,description,audience,metric,target,art_key,tier,sort_order) values
('worker_tenure_7','함께한 첫 일주일','계정 가입일부터 7일 경과 · 한국시간 기준','worker','member_days',7,0,'bronze',400),
('worker_tenure_30','한 달의 동행','계정 가입일부터 30일 경과 · 한국시간 기준','worker','member_days',30,4,'bronze',401),
('worker_tenure_100','함께한 100일','계정 가입일부터 100일 경과 · 한국시간 기준','worker','member_days',100,5,'silver',402),
('worker_tenure_180','반년의 동행','계정 가입일부터 180일 경과 · 한국시간 기준','worker','member_days',180,3,'teal',403),
('worker_tenure_365','함께한 첫해','계정 가입일부터 365일 경과 · 한국시간 기준','worker','member_days',365,6,'gold',404),
('worker_tenure_730','두 해의 동행','계정 가입일부터 730일 경과 · 한국시간 기준','worker','member_days',730,7,'gold',405),
('owner_tenure_7','우리 업체 · 함께한 첫 일주일','업체 등록일부터 7일 경과 · 한국시간 기준','owner','company_days',7,0,'bronze',410),
('owner_tenure_30','우리 업체 · 한 달의 동행','업체 등록일부터 30일 경과 · 한국시간 기준','owner','company_days',30,4,'bronze',411),
('owner_tenure_100','우리 업체 · 함께한 100일','업체 등록일부터 100일 경과 · 한국시간 기준','owner','company_days',100,5,'silver',412),
('owner_tenure_180','우리 업체 · 반년의 동행','업체 등록일부터 180일 경과 · 한국시간 기준','owner','company_days',180,3,'teal',413),
('owner_tenure_365','우리 업체 · 함께한 첫해','업체 등록일부터 365일 경과 · 한국시간 기준','owner','company_days',365,6,'gold',414),
('owner_tenure_730','우리 업체 · 두 해의 동행','업체 등록일부터 730일 경과 · 한국시간 기준','owner','company_days',730,7,'gold',415)
on conflict(id) do nothing;

notify pgrst,'reload schema';
commit;

select '가입 기간 배지 설정 완료' as result,count(*) as new_badges
from public.achievement_definitions
where id in ('worker_tenure_7','worker_tenure_30','worker_tenure_100','worker_tenure_180','worker_tenure_365','worker_tenure_730','owner_tenure_7','owner_tenure_30','owner_tenure_100','owner_tenure_180','owner_tenure_365','owner_tenure_730');
