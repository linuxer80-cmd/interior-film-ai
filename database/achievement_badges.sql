-- Run in SQL Editor. Additive catalog; existing work records are never changed.
begin;
create table if not exists public.achievement_definitions (
 id text primary key check(id ~ '^[a-z][a-z0-9_]{2,63}$'),
 title text not null check(length(title) between 1 and 60),
 description text not null check(length(description) between 1 and 500),
 audience text not null check(audience in ('owner','worker')),
 metric text not null check(metric in ('registered_sites','approved_sites','settled_sites','connected_workers','complete_profile','approved_reports','returned_sites')),
 target integer not null check(target between 1 and 100000),
 art_key integer not null default 0 check(art_key between 0 and 7),
 image_path text not null default '' check(length(image_path)<=300 and (image_path='' or image_path ~ '^custom/[a-f0-9-]+\.(png|jpg|webp)$')),
 tier text not null default 'bronze' check(tier in ('bronze','silver','gold','teal')),
 sort_order integer not null default 0 check(sort_order between 0 and 100000),
 active boolean not null default true,
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 check((audience='owner' and metric in ('registered_sites','approved_sites','settled_sites','connected_workers')) or (audience='worker' and metric in ('complete_profile','approved_reports','returned_sites')))
);
create table if not exists public.achievement_awards (
 subject_key text not null,
 badge_id text not null references public.achievement_definitions(id),
 earned_at timestamptz not null default now(),
 progress_at_award bigint not null,
 primary key(subject_key,badge_id)
);
-- A company award is shared; celebration receipts and featured selection are personal.
create table if not exists public.achievement_preferences (
 user_id uuid not null references auth.users(id) on delete cascade,
 subject_key text not null,
 featured_badge text references public.achievement_definitions(id),
 primary key(user_id,subject_key)
);
create table if not exists public.achievement_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 subject_key text not null,
 badge_id text not null,
 seen_at timestamptz not null default now(),
 primary key(user_id,subject_key,badge_id),
 foreign key(subject_key,badge_id) references public.achievement_awards(subject_key,badge_id)
);
alter table public.achievement_definitions enable row level security;
alter table public.achievement_awards enable row level security;
alter table public.achievement_preferences enable row level security;
alter table public.achievement_receipts enable row level security;
revoke all on public.achievement_definitions,public.achievement_awards,public.achievement_preferences,public.achievement_receipts from public,anon,authenticated;
grant select,insert,update on public.achievement_definitions,public.achievement_awards,public.achievement_preferences,public.achievement_receipts to service_role;

insert into public.achievement_definitions(id,title,description,audience,metric,target,art_key,tier,sort_order) values
 ('first_site','첫 현장 시작','취소되지 않은 첫 현장 등록','owner','registered_sites',1,0,'bronze',10),
 ('site_expert','현장 관리 전문가','서로 다른 현장 10건의 완료보고 검수 승인','owner','approved_sites',10,1,'gold',20),
 ('stock_care','꼼꼼한 자재 관리','롤 반입 정산과 완료보고 승인을 마친 현장 5건','owner','settled_sites',5,2,'teal',30),
 ('team_ready','우리 팀 완성','연결을 수락한 활성 시공자 3명 (본인 제외)','owner','connected_workers',3,3,'silver',40),
 ('profile_ready','준비된 시공자','이름·사진·지역·연락처·기본 일당을 갖춘 프로필 저장','worker','complete_profile',1,4,'silver',10),
 ('first_report','첫 마무리','직접 제출한 첫 완료보고서 승인','worker','approved_reports',1,5,'bronze',20),
 ('report_expert','믿음직한 마무리','직접 제출한 서로 다른 현장 완료보고서 10건 승인','worker','approved_reports',10,6,'gold',30),
 ('return_expert','자재 정리 달인','직접 롤 반입을 기록하고 전체 롤 반입·보고 승인을 마친 현장 10건','worker','returned_sites',10,7,'teal',40)
on conflict(id) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('achievement-badges','achievement-badges',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;

create or replace function public.achievement_action(p_actor uuid,p_action text,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 co uuid; scope text; subject text; metrics jsonb; n1 bigint:=0; n2 bigint:=0; n3 bigint:=0; n4 bigint:=0;
 badge public.achievement_definitions%rowtype; existing public.achievement_definitions%rowtype;
 badge_key text; amount bigint; rows_json jsonb;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
 or exists(select 1 from public.profiles where id=p_actor and is_active=false) then
  raise exception '인증된 활성 계정으로 로그인해주세요.' using errcode='42501';
 end if;
 if p_action in ('catalog','save') then
  if not exists(select 1 from public.super_admins where user_id=p_actor and is_active=true) then raise exception '슈퍼관리자만 배지를 관리할 수 있습니다.' using errcode='42501'; end if;
  if p_action='save' then
   badge_key:=p_body->>'id';
   if badge_key is null or badge_key !~ '^[a-z][a-z0-9_]{2,63}$' then raise exception '배지 ID를 확인해주세요.' using errcode='22023'; end if;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('achievement-catalog',0));
   select * into existing from public.achievement_definitions where id=badge_key for update;
   if coalesce(existing.revision,0) is distinct from (p_body->>'revision')::integer then raise exception '배지 설정이 변경되었습니다. 새로고침해주세요.' using errcode='40001'; end if;
   if existing.id is not null and exists(select 1 from public.achievement_awards where badge_id=badge_key)
    and (existing.audience is distinct from p_body->>'audience' or existing.metric is distinct from p_body->>'metric' or existing.target is distinct from (p_body->>'target')::integer) then
    raise exception '획득자가 있는 배지의 대상·조건·목표는 변경할 수 없습니다. 새 배지로 추가해주세요.' using errcode='22023';
   end if;
   if existing.id is null and (select count(*) from public.achievement_definitions)>=500 then raise exception '배지는 최대 500개까지 등록할 수 있습니다.' using errcode='22023'; end if;
   if coalesce(p_body->>'image_path','')<>'' and not exists(select 1 from storage.objects where bucket_id='achievement-badges' and name=p_body->>'image_path') then raise exception '배지 이미지를 먼저 업로드해주세요.' using errcode='22023'; end if;
   insert into public.achievement_definitions(id,title,description,audience,metric,target,art_key,image_path,tier,sort_order,active)
   values(badge_key,btrim(p_body->>'title'),btrim(p_body->>'description'),p_body->>'audience',p_body->>'metric',(p_body->>'target')::integer,
    (p_body->>'art_key')::integer,coalesce(p_body->>'image_path',''),p_body->>'tier',(p_body->>'sort_order')::integer,(p_body->>'active')::boolean)
   on conflict(id) do update set title=excluded.title,description=excluded.description,audience=excluded.audience,metric=excluded.metric,target=excluded.target,
    art_key=excluded.art_key,image_path=excluded.image_path,tier=excluded.tier,sort_order=excluded.sort_order,active=excluded.active,revision=achievement_definitions.revision+1,updated_at=now();
  end if;
  return jsonb_build_object('badges',coalesce((select jsonb_agg(to_jsonb(d) order by sort_order,id) from public.achievement_definitions d),'[]'::jsonb));
 end if;
 scope:=p_body->>'scope';
 if scope='owner' then
  select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id
   where p.id=p_actor and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
  if co is null then raise exception '활성 업체 관리자만 업체 업적을 볼 수 있습니다.' using errcode='42501'; end if;
  subject:='company:'||co::text;
 elsif scope='worker' then
  subject:='user:'||p_actor::text;
 else raise exception '업적 대상을 확인해주세요.' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('achievement:'||subject,0));
 if p_action='feature' then
  badge_key:=nullif(p_body->>'badge_id','');
  if badge_key is not null and not exists(select 1 from public.achievement_awards where subject_key=subject and badge_id=badge_key) then raise exception '획득한 배지만 선택할 수 있습니다.' using errcode='42501'; end if;
  insert into public.achievement_preferences(user_id,subject_key,featured_badge) values(p_actor,subject,badge_key)
   on conflict(user_id,subject_key) do update set featured_badge=excluded.featured_badge;
  return jsonb_build_object('ok',true);
 elsif p_action='seen' then
  if jsonb_typeof(p_body->'badge_ids') is distinct from 'array' then raise exception '확인할 배지를 선택해주세요.' using errcode='22023'; end if;
  insert into public.achievement_receipts(user_id,subject_key,badge_id)
   select p_actor,subject,a.badge_id from public.achievement_awards a
   where a.subject_key=subject and a.badge_id in(select jsonb_array_elements_text(p_body->'badge_ids'))
   on conflict do nothing;
  return jsonb_build_object('ok',true);
 elsif p_action<>'get' then raise exception '지원하지 않는 업적 요청입니다.' using errcode='22023'; end if;

 if scope='owner' then
  select count(*) into n1 from public.sites where company_id=co and status is distinct from 'cancelled';
  select count(distinct r.site_id) into n2 from public.work_reports r join public.sites s on s.id=r.site_id and s.company_id=r.company_id
   where r.company_id=co and r.review_status='approved' and s.status is distinct from 'cancelled';
  select count(*) into n3 from public.sites s where s.company_id=co and s.status is distinct from 'cancelled'
   and exists(select 1 from public.work_reports r where r.company_id=co and r.site_id=s.id and r.review_status='approved')
   and exists(select 1 from public.film_stock_trips t where t.company_id=co and t.site_id=s.id)
   and not exists(select 1 from public.film_stock_trips t where t.company_id=co and t.site_id=s.id and t.returned is null);
  select count(distinct w.user_id) into n4 from public.workers w join public.worker_relationships r
   on r.worker_id=w.id and r.company_id=w.company_id and r.user_id=w.user_id and r.ended_at is null
   where w.company_id=co and w.is_active=true and w.user_id<>p_actor;
  metrics:=jsonb_build_object('registered_sites',n1,'approved_sites',n2,'settled_sites',n3,'connected_workers',n4);
 else
  select count(*) into n1 from public.labor_profiles p join public.labor_personal_details d on d.user_id=p.user_id
   where p.user_id=p_actor and nullif(btrim(p.name),'') is not null and nullif(btrim(p.photo_path),'') is not null
    and nullif(btrim(p.region),'') is not null and nullif(btrim(d.phone),'') is not null and p.daily_wage>0;
  select count(distinct r.site_id) into n2 from public.work_reports r join public.sites s on s.id=r.site_id and s.company_id=r.company_id
   where r.created_by=p_actor and r.review_status='approved' and s.status is distinct from 'cancelled';
  select count(distinct t.site_id) into n3 from public.film_stock_trips t join public.sites s on s.id=t.site_id and s.company_id=t.company_id
   where t.returned_by=p_actor and t.returned is not null and s.status is distinct from 'cancelled'
    and exists(select 1 from public.work_reports r where r.site_id=t.site_id and r.company_id=t.company_id and r.review_status='approved')
    and not exists(select 1 from public.film_stock_trips other where other.site_id=t.site_id and other.company_id=t.company_id and other.returned is null);
  metrics:=jsonb_build_object('complete_profile',n1,'approved_reports',n2,'returned_sites',n3);
 end if;
 -- Shared catalog lock prevents changing a goal while its first award is granted.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('achievement-catalog',0));
 for badge in select * from public.achievement_definitions where active=true and audience=scope loop
  amount:=coalesce((metrics->>badge.metric)::bigint,0);
  if amount>=badge.target then
   insert into public.achievement_awards(subject_key,badge_id,progress_at_award) values(subject,badge.id,amount) on conflict do nothing;
  end if;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order,x.id),'[]'::jsonb) into rows_json from (
  select d.*,coalesce((metrics->>d.metric)::bigint,0) as progress,a.earned_at,
   a.badge_id is not null and not exists(select 1 from public.achievement_receipts r where r.user_id=p_actor and r.subject_key=subject and r.badge_id=d.id) as unseen
  from public.achievement_definitions d left join public.achievement_awards a on a.badge_id=d.id and a.subject_key=subject
  where d.audience=scope and (d.active or a.badge_id is not null)
 ) x;
 return jsonb_build_object('scope',scope,'badges',rows_json,'featured',(select featured_badge from public.achievement_preferences where user_id=p_actor and subject_key=subject));
end $$;
revoke all on function public.achievement_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.achievement_action(uuid,text,jsonb) to service_role;
commit;
