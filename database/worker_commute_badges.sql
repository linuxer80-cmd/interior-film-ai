begin;
create table if not exists public.worker_badge_commutes (
 id uuid primary key default gen_random_uuid(),
 attendance_id uuid not null unique references public.attendance_records(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid not null references public.companies(id),
 site_id uuid not null references public.sites(id),
 work_day date not null,
 origin_address text not null,
 destination_address text not null,
 one_way_m integer check(one_way_m between 0 and 1500000),
 attempts integer not null default 0,
 lease_until timestamptz not null default now(),
 claim_token uuid,
 created_at timestamptz not null default now(),
 unique(user_id,site_id,work_day)
);
alter table public.worker_badge_commutes enable row level security;
revoke all on public.worker_badge_commutes from public,anon,authenticated;
grant select,insert,update on public.worker_badge_commutes to service_role;

create or replace function public.capture_badge_commute()
returns trigger language plpgsql security invoker set search_path='' as $$
declare actor uuid; origin text;
begin
 select w.user_id into actor from public.workers w
 where w.id=new.worker_id and w.company_id=new.company_id;
 if actor is null or new.work_day<>(now() at time zone 'Asia/Seoul')::date
  or (new.clock_in at time zone 'Asia/Seoul')::date<>new.work_day then return new; end if;
 select nullif(btrim(d.departure_address),'') into origin
 from public.labor_personal_details d where d.user_id=actor;
 if origin is null then
  select nullif(btrim(d.departure_address),'') into origin
  from public.worker_private_details d
  where d.worker_id=new.worker_id and d.company_id=new.company_id;
 end if;
 if origin is null or nullif(btrim(new.site_address),'') is null then return new; end if;
 insert into public.worker_badge_commutes
 (attendance_id,user_id,company_id,site_id,work_day,origin_address,destination_address)
 values(new.id,actor,new.company_id,new.site_id,new.work_day,origin,btrim(new.site_address))
 on conflict do nothing;
 return new;
end $$;
revoke all on function public.capture_badge_commute() from public,anon,authenticated;
grant execute on function public.capture_badge_commute() to service_role;
drop trigger if exists capture_badge_commute on public.attendance_records;
create trigger capture_badge_commute after insert on public.attendance_records
for each row execute function public.capture_badge_commute();

create or replace function public.claim_badge_commute(p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare trip public.worker_badge_commutes%rowtype;
begin
 -- One outstanding calculation per user prevents parallel duplicate map calls.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('commute-badge:'||p_actor::text,0));
 if exists(select 1 from public.worker_badge_commutes
  where user_id=p_actor and one_way_m is null and claim_token is not null
   and lease_until>now()) then return null; end if;
 select t.* into trip
 from public.worker_badge_commutes t
 join public.attendance_records a on a.id=t.attendance_id
 join public.workers w on w.id=a.worker_id and w.company_id=a.company_id and w.user_id=t.user_id
 join public.sites s on s.id=a.site_id and s.company_id=a.company_id
 where t.user_id=p_actor and t.site_id=a.site_id and t.company_id=a.company_id and t.work_day=a.work_day and t.one_way_m is null
  and t.attempts<5 and t.lease_until<=now()
  and a.review_status<>'rejected'
  and (a.in_verified or a.review_status='approved')
  and s.status is distinct from 'cancelled'
 order by t.created_at,t.id limit 1 for update of t skip locked;
 if trip.id is null then return null; end if;
 update public.worker_badge_commutes
 set claim_token=gen_random_uuid(),attempts=attempts+1,
  lease_until=now()+interval '2 minutes'
 where id=trip.id returning * into trip;
 return to_jsonb(trip);
end $$;
revoke all on function public.claim_badge_commute(uuid) from public,anon,authenticated;
grant execute on function public.claim_badge_commute(uuid) to service_role;

create or replace function public.achievement_worker_metrics(p_actor uuid)
returns jsonb language sql security invoker set search_path='' as $$
 with eligible as (
  select a.id,a.site_id,a.work_day
  from public.attendance_records a
  join public.workers w on w.id=a.worker_id and w.company_id=a.company_id
  join public.sites s on s.id=a.site_id and s.company_id=a.company_id
  where w.user_id=p_actor and a.review_status<>'rejected'
   and (a.in_verified or a.review_status='approved')
   and s.status is distinct from 'cancelled'
 ), trips as (
  select t.* from public.worker_badge_commutes t
  join eligible e on e.id=t.attendance_id and e.site_id=t.site_id and e.work_day=t.work_day
  where t.user_id=p_actor and t.one_way_m is not null
 )
 select jsonb_build_object(
  'departure_registered',case when
   exists(select 1 from public.labor_personal_details d where d.user_id=p_actor and nullif(btrim(d.departure_address),'') is not null)
   or exists(select 1 from public.worker_private_details d join public.workers w on w.id=d.worker_id and w.company_id=d.company_id
    where w.user_id=p_actor and w.is_active=true and nullif(btrim(d.departure_address),'') is not null)
   then 1 else 0 end,
  'commute_trips',(select count(*) from trips),
  'commute_km',(select floor(coalesce(sum(one_way_m::bigint*2),0)/1000)::bigint from trips),
  'attendance_days',(select count(distinct work_day) from eligible),
  'attendance_sites',(select count(distinct site_id) from eligible)
 );
$$;
revoke all on function public.achievement_worker_metrics(uuid) from public,anon,authenticated;
grant execute on function public.achievement_worker_metrics(uuid) to service_role;
grant select on public.attendance_records to service_role;

do $constraints$
declare item record;
begin
 for item in select c.conname from pg_constraint c
 where c.conrelid='public.achievement_definitions'::regclass and c.contype='c'
 and (select a.attnum from pg_attribute a where a.attrelid=c.conrelid and a.attname='metric')=any(c.conkey)
 loop execute format('alter table public.achievement_definitions drop constraint %I',item.conname); end loop;
end $constraints$;
alter table public.achievement_definitions add constraint achievement_metric_audience_check check(
 (audience='owner' and metric in ('registered_sites','approved_sites','settled_sites','connected_workers','ai_photo','ai_search','ai_virtual','ai_cutting','ai_receipt','ai_consult','ai_voice','ai_quick','ai_variety'))
 or (audience='worker' and metric in ('complete_profile','approved_reports','returned_sites','departure_registered','commute_trips','commute_km','attendance_days','attendance_sites'))
);
do $patch$
declare source text;
begin
 source:=pg_get_functiondef('public.achievement_action(uuid,text,jsonb)'::regprocedure);
 if position('achievement_worker_metrics' in source)=0 then
  if (select count(*) from regexp_matches(source,'for\s+badge\s+in','gi'))<>1 then
   raise exception '업적 함수 구조 확인이 필요합니다.';
  end if;
  execute regexp_replace(source,'for\s+badge\s+in',
   E'if scope = ''worker'' then\n metrics := metrics || public.achievement_worker_metrics(p_actor);\n end if;\n for badge in','i');
 end if;
end $patch$;
revoke all on function public.achievement_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.achievement_action(uuid,text,jsonb) to service_role;

insert into public.achievement_definitions
(id,title,description,audience,metric,target,art_key,tier,sort_order)
values
('worker_departure','나의 출발점','출발지 주소 등록 (집·작업실 등 평소 출발하는 곳)','worker','departure_registered',1,4,'bronze',200),
('worker_commute_first','현장으로 첫걸음','출근이 확인되고 왕복거리 계산이 완료된 현장 1건','worker','commute_trips',1,0,'bronze',210),
('worker_km_50','동네를 누비다','누적 현장 출근 거리 50km · 편도 도로거리의 2배','worker','commute_km',50,0,'bronze',220),
('worker_km_100','백 킬로의 발걸음','누적 현장 출근 거리 100km · 왕복 기준','worker','commute_km',100,1,'silver',221),
('worker_km_300','부지런한 시공자','누적 현장 출근 거리 300km · 왕복 기준','worker','commute_km',300,2,'silver',222),
('worker_km_500','오백 킬로의 열정','누적 현장 출근 거리 500km · 왕복 기준','worker','commute_km',500,3,'gold',223),
('worker_km_1000','천 킬로의 기록','누적 현장 출근 거리 1000km · 왕복 기준','worker','commute_km',1000,6,'gold',224),
('worker_km_3000','현장을 잇는 발걸음','누적 현장 출근 거리 3000km · 왕복 기준','worker','commute_km',3000,7,'gold',225),
('worker_days_10','열흘의 성실함','GPS 또는 관리자 승인으로 확인된 출근 10일','worker','attendance_days',10,5,'bronze',230),
('worker_days_30','서른 날의 꾸준함','GPS 또는 관리자 승인으로 확인된 출근 30일','worker','attendance_days',30,5,'silver',231),
('worker_days_100','백 일의 현장 기록','GPS 또는 관리자 승인으로 확인된 출근 100일','worker','attendance_days',100,6,'gold',232),
('worker_sites_5','현장 경험 수집가','출근이 확인된 서로 다른 현장 5곳','worker','attendance_sites',5,0,'bronze',240),
('worker_sites_20','다양한 현장의 경험','출근이 확인된 서로 다른 현장 20곳','worker','attendance_sites',20,1,'silver',241),
('worker_sites_50','쉰 곳의 현장 이야기','출근이 확인된 서로 다른 현장 50곳','worker','attendance_sites',50,6,'gold',242)
on conflict(id) do nothing;
notify pgrst,'reload schema';
commit;
select '시공자 왕복거리 배지 설정 완료' as result,count(*) as new_badges
from public.achievement_definitions where id in (
'worker_departure','worker_commute_first','worker_km_50','worker_km_100','worker_km_300','worker_km_500','worker_km_1000','worker_km_3000','worker_days_10','worker_days_30','worker_days_100','worker_sites_5','worker_sites_20','worker_sites_50');

