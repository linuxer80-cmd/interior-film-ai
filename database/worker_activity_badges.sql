begin;
create table if not exists public.worker_activity_days (
 user_id uuid not null references auth.users(id) on delete cascade,
 feature text not null check(feature in ('cutting','nearby_food','nearby_film')),
 activity_day date not null default (now() at time zone 'Asia/Seoul')::date,
 created_at timestamptz not null default now(),
 primary key(user_id,feature,activity_day)
);
alter table public.worker_activity_days enable row level security;
revoke all on public.worker_activity_days from public,anon,authenticated;
grant select,insert on public.worker_activity_days to service_role;

create or replace function public.record_worker_activity_day(p_actor uuid,p_feature text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_feature is null or p_feature not in ('cutting','nearby_food','nearby_film') then
  raise exception '사용 기능을 확인해주세요.' using errcode='22023';
 end if;
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
  or exists(select 1 from public.profiles where id=p_actor and is_active=false)
  or not (
   exists(select 1 from public.workers w join public.companies c on c.id=w.company_id
    where w.user_id=p_actor and w.is_active=true and c.is_active is distinct from false)
   or exists(select 1 from public.profiles p join public.companies c on c.id=p.company_id
    where p.id=p_actor and p.role='owner' and p.is_active is distinct from false and c.is_active=true)
  ) then
  raise exception '활성 시공자 계정을 확인해주세요.' using errcode='42501';
 end if;
 insert into public.worker_activity_days(user_id,feature)
 values(p_actor,p_feature) on conflict do nothing;
end $$;
revoke all on function public.record_worker_activity_day(uuid,text) from public,anon,authenticated;
grant execute on function public.record_worker_activity_day(uuid,text) to service_role;

create or replace function public.achievement_worker_activity_metrics(p_actor uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
  'cutting_days',count(*) filter(where feature='cutting'),
  'nearby_food_days',count(*) filter(where feature='nearby_food'),
  'nearby_film_days',count(*) filter(where feature='nearby_film')
 ) from public.worker_activity_days where user_id=p_actor;
$$;
revoke all on function public.achievement_worker_activity_metrics(uuid) from public,anon,authenticated;
grant execute on function public.achievement_worker_activity_metrics(uuid) to service_role;

do $constraints$
declare item record;
begin
 for item in select c.conname from pg_constraint c
 where c.conrelid='public.achievement_definitions'::regclass and c.contype='c'
 and (select a.attnum from pg_attribute a where a.attrelid=c.conrelid and a.attname='metric')=any(c.conkey)
 loop execute format('alter table public.achievement_definitions drop constraint %I',item.conname); end loop;
end $constraints$;
alter table public.achievement_definitions add constraint achievement_metric_audience_check check(
 (audience='owner' and metric in ('ai_photo','ai_search','ai_virtual','ai_cutting','ai_receipt','ai_consult','ai_voice','ai_quick','ai_variety','registered_sites','approved_sites','settled_sites','connected_workers'))
 or (audience='worker' and metric in ('cutting_days','nearby_food_days','nearby_film_days','departure_registered','commute_trips','commute_km','attendance_days','attendance_sites','complete_profile','approved_reports','returned_sites'))
);

do $patch$
declare source text;
begin
 source:=pg_get_functiondef('public.achievement_action(uuid,text,jsonb)'::regprocedure);
 if position('achievement_worker_activity_metrics' in source)=0 then
  if (select count(*) from regexp_matches(source,'for\s+badge\s+in','gi'))<>1 then
   raise exception '업적 함수 구조 확인이 필요합니다.';
  end if;
  execute regexp_replace(source,'for\s+badge\s+in',
   E'if scope = ''worker'' then\n metrics := metrics || public.achievement_worker_activity_metrics(p_actor);\n end if;\n for badge in','i');
 end if;
end $patch$;
revoke all on function public.achievement_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.achievement_action(uuid,text,jsonb) to service_role;

insert into public.achievement_definitions
(id,title,description,audience,metric,target,art_key,tier,sort_order) values
('worker_cutting_1','재단 첫걸음','재단 계산을 완료한 날 1일 · 한국시간 하루 한 번 인정','worker','cutting_days',1,2,'bronze',300),
('worker_cutting_5','재단 습관 만들기','재단 계산을 완료한 날 5일 · 한국시간 하루 한 번 인정','worker','cutting_days',5,2,'silver',301),
('worker_cutting_20','재단 도우미 활용가','재단 계산을 완료한 날 20일 · 한국시간 하루 한 번 인정','worker','cutting_days',20,2,'teal',302),
('worker_cutting_50','꾸준한 재단 전문가','재단 계산을 완료한 날 50일 · 한국시간 하루 한 번 인정','worker','cutting_days',50,2,'gold',303),
('worker_food_1','현장 밥집 탐색','현장 주변 음식점 검색 결과를 확인한 날 1일 · 한국시간 하루 한 번 인정','worker','nearby_food_days',1,4,'bronze',310),
('worker_food_5','점심 탐색가','현장 주변 음식점 검색 결과를 확인한 날 5일 · 한국시간 하루 한 번 인정','worker','nearby_food_days',5,4,'silver',311),
('worker_food_20','현장 주변 길잡이','현장 주변 음식점 검색 결과를 확인한 날 20일 · 한국시간 하루 한 번 인정','worker','nearby_food_days',20,4,'teal',312),
('worker_food_50','꾸준한 밥집 탐색가','현장 주변 음식점 검색 결과를 확인한 날 50일 · 한국시간 하루 한 번 인정','worker','nearby_food_days',50,4,'gold',313),
('worker_filmshop_1','필름가게 첫 탐색','현장 주변 필름·자재점 검색 결과를 확인한 날 1일 · 한국시간 하루 한 번 인정','worker','nearby_film_days',1,3,'bronze',320),
('worker_filmshop_5','자재점 탐색가','현장 주변 필름·자재점 검색 결과를 확인한 날 5일 · 한국시간 하루 한 번 인정','worker','nearby_film_days',5,3,'silver',321),
('worker_filmshop_20','현장 자재 길잡이','현장 주변 필름·자재점 검색 결과를 확인한 날 20일 · 한국시간 하루 한 번 인정','worker','nearby_film_days',20,3,'teal',322),
('worker_filmshop_50','꾸준한 자재점 탐색가','현장 주변 필름·자재점 검색 결과를 확인한 날 50일 · 한국시간 하루 한 번 인정','worker','nearby_film_days',50,3,'gold',323)
on conflict(id) do nothing;
notify pgrst,'reload schema';
commit;
select '시공자 도구 사용 배지 설정 완료' as result,count(*) as new_badges
from public.achievement_definitions where id in (
'worker_cutting_1','worker_cutting_5','worker_cutting_20','worker_cutting_50','worker_food_1','worker_food_5','worker_food_20','worker_food_50','worker_filmshop_1','worker_filmshop_5','worker_filmshop_20','worker_filmshop_50'
);
