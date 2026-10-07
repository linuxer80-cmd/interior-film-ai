create table public.attendance_settings (
 company_id uuid primary key references public.companies(id),
 cutoff time not null default '17:00',
 hourly_rate integer not null check(hourly_rate between 0 and 1000000),
 radius_m integer not null default 200 check(radius_m between 50 and 2000),
 updated_at timestamptz not null default now()
);

create table public.attendance_locations (
 site_id uuid primary key references public.sites(id),
 company_id uuid not null references public.companies(id),
 address text not null,
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 updated_at timestamptz not null default now()
);

create table public.attendance_records (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 site_id uuid not null references public.sites(id),
 worker_id uuid not null references public.workers(id),
 work_day date not null,
 clock_in timestamptz not null default now(),
 clock_out timestamptz,
 in_gps jsonb not null,
 out_gps jsonb,
 in_distance_m integer,
 out_distance_m integer,
 in_verified boolean not null,
 out_verified boolean,
 site_address text not null,
 site_lat double precision,
 site_lng double precision,
 radius_m integer not null,
 cutoff time not null,
 hourly_rate integer not null,
 overtime_minutes integer not null default 0,
 break_minutes integer not null default 0,
 overtime_amount integer not null default 0,
 review_status text not null default 'pending'
   check(review_status in ('pending','approved','rejected')),
 review_note text not null default '',
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 expense_id uuid references public.site_expenses(id),
 unique(worker_id,site_id,work_day),
 check(clock_out is null or clock_out>=clock_in)
);

create unique index attendance_one_open_shift
 on public.attendance_records(worker_id)
 where clock_out is null;

create index attendance_company_day
 on public.attendance_records(company_id,work_day);

create index attendance_worker_day
 on public.attendance_records(worker_id,work_day);

alter table public.attendance_settings enable row level security;
alter table public.attendance_locations enable row level security;
alter table public.attendance_records enable row level security;

revoke all on
 public.attendance_settings,
 public.attendance_locations,
 public.attendance_records
 from public,anon,authenticated;

grant all on
 public.attendance_settings,
 public.attendance_locations,
 public.attendance_records
 to service_role;

create function public.attendance_action(
 p_user uuid,
 p_action text,
 p_body jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
 c uuid;
 w uuid;
 owner_access boolean:=false;
 s public.sites%rowtype;
 cfg public.attendance_settings%rowtype;
 loc public.attendance_locations%rowtype;
 rec public.attendance_records%rowtype;
 t timestamptz:=clock_timestamp();
 day_k date:=(t at time zone 'Asia/Seoul')::date;
 lat double precision;
 lng double precision;
 accuracy double precision;
 distance_m integer;
 verified boolean:=false;
 gps jsonb;
 cutoff_at timestamptz;
 minutes integer;
 breaks integer;
 amount integer;
 expense uuid;
 worker_name text;
begin
 select p.company_id into c
 from public.profiles p
 join public.companies co on co.id=p.company_id
 where p.id=p_user
   and p.role='owner'
   and p.is_active=true
   and co.is_active=true;

 owner_access:=c is not null;

 if p_action in ('settings','location','review')
    and not owner_access then
  raise exception '관리자 권한이 필요합니다.'
    using errcode='42501';
 end if;

 if p_action='settings' then
  if (p_body->>'cutoff') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
   raise exception '퇴근 기준시각을 확인해주세요.';
  end if;

  insert into public.attendance_settings(
   company_id,cutoff,hourly_rate,radius_m
  )
  values(
   c,
   (p_body->>'cutoff')::time,
   (p_body->>'hourlyRate')::integer,
   (p_body->>'radius')::integer
  )
  on conflict(company_id) do update set
   cutoff=excluded.cutoff,
   hourly_rate=excluded.hourly_rate,
   radius_m=excluded.radius_m,
   updated_at=t;

  return jsonb_build_object('success',true);
 end if;

 if p_action='location' then
  select * into s
  from public.sites
  where id=(p_body->>'siteId')::uuid and company_id=c;

  if s.id is null or nullif(trim(s.address),'') is null then
   raise exception '현장 주소를 먼저 등록해주세요.';
  end if;

  if p_body->>'address' is distinct from s.address then
   raise exception '현장 주소가 변경되었습니다. 새로 조회해주세요.';
  end if;

  insert into public.attendance_locations(
   site_id,company_id,address,latitude,longitude
  )
  values(
   s.id,c,s.address,
   (p_body->>'latitude')::double precision,
   (p_body->>'longitude')::double precision
  )
  on conflict(site_id) do update set
   address=excluded.address,
   latitude=excluded.latitude,
   longitude=excluded.longitude,
   updated_at=t;

  return jsonb_build_object('success',true);
 end if;

 if p_action='review' then
  select * into rec
  from public.attendance_records
  where id=(p_body->>'id')::uuid and company_id=c
  for update;

  if rec.id is null or rec.clock_out is null then
   raise exception '퇴근이 기록된 내역만 검토할 수 있습니다.';
  end if;

  if rec.review_status<>'pending' then
   raise exception '이미 처리한 기록입니다. 새로 조회해주세요.';
  end if;

  if p_body->>'status' not in ('approved','rejected') then
   raise exception '처리 상태를 확인해주세요.';
  end if;

  breaks:=(p_body->>'breakMinutes')::integer;

  if breaks is null or breaks<0 or breaks>rec.overtime_minutes then
   raise exception '연장시간 내 휴게시간을 확인해주세요.';
  end if;

  if length(trim(coalesce(p_body->>'note','')))=0 then
   raise exception '확인 사유를 입력해주세요.';
  end if;

  amount:=round(
   greatest(0,rec.overtime_minutes-breaks)*rec.hourly_rate/60.0
  )::integer;

  if p_body->>'status'='approved' and amount>0 then
   select name into worker_name
   from public.workers
   where id=rec.worker_id and company_id=c;

   insert into public.site_expenses(
    company_id,site_id,expense_type,amount,
    description,expense_date,created_by
   )
   values(
    c,rec.site_id,'other',amount,
    '출퇴근/연장:'||jsonb_build_object(
     'workerId',rec.worker_id,
     'name',worker_name,
     'attendanceId',rec.id,
     'minutes',rec.overtime_minutes-breaks
    )::text,
    rec.work_day,p_user
   )
   returning id into expense;
  end if;

  update public.attendance_records set
   review_status=p_body->>'status',
   review_note=left(p_body->>'note',500),
   reviewed_by=p_user,
   reviewed_at=t,
   break_minutes=breaks,
   overtime_amount=case
    when p_body->>'status'='approved' then amount
    else 0
   end,
   expense_id=expense
  where id=rec.id;

  return jsonb_build_object('success',true);
 end if;

 if exists(
  select 1 from public.profiles
  where id=p_user and is_active=false
 ) then
  raise exception '비활성 계정입니다.' using errcode='42501';
 end if;

 if p_action not in ('in','out') then
  raise exception '지원하지 않는 요청입니다.';
 end if;

 if coalesce((p_body->>'consent')::boolean,false) is not true then
  raise exception '위치 기록 안내를 확인해주세요.';
 end if;

 if p_action='out' then
  select * into rec
  from public.attendance_records
  where id=(p_body->>'id')::uuid;

  select x.id,x.company_id into w,c
  from public.workers x
  join public.companies co on co.id=x.company_id
  where x.id=rec.worker_id
    and x.user_id=p_user
    and x.is_active=true
    and co.is_active=true;
 else
  select * into s
  from public.sites
  where id=(p_body->>'siteId')::uuid and status<>'cancelled';

  select x.id,x.company_id into w,c
  from public.workers x
  join public.companies co on co.id=x.company_id
  where x.company_id=s.company_id
    and x.user_id=p_user
    and x.is_active=true
    and co.is_active=true;
 end if;

 if w is null then
  raise exception '본인에게 배정된 현장만 출퇴근할 수 있습니다.'
   using errcode='42501';
 end if;

 perform pg_advisory_xact_lock(hashtextextended(w::text,0));

 if p_action='out' then
  select * into rec
  from public.attendance_records
  where id=rec.id
  for update;

  if rec.clock_out is not null then
   return jsonb_build_object(
    'success',true,
    'message','이미 퇴근이 기록되어 있습니다.'
   );
  end if;
 else
  if exists(
   select 1 from public.site_daily_assignments
   where site_id=s.id and company_id=c
  ) then
   if not exists(
    select 1 from public.site_daily_assignments
    where site_id=s.id
      and company_id=c
      and worker_id=w
      and work_date=day_k
   ) then
    raise exception '오늘 이 현장에 배정되어 있지 않습니다.';
   end if;
  else
   if not exists(
    select 1 from public.site_workers
    where site_id=s.id and company_id=c and worker_id=w
   ) or not coalesce((
    case
     when s.work_dates is not null then day_k=any(s.work_dates)
     else day_k between
      (s.schedule_start at time zone 'Asia/Seoul')::date
      and coalesce(
       (s.schedule_end at time zone 'Asia/Seoul')::date,
       (s.schedule_start at time zone 'Asia/Seoul')::date
      )
    end
   ),false) then
    raise exception '오늘 이 현장에 배정되어 있지 않습니다.';
   end if;
  end if;

  select * into rec
  from public.attendance_records
  where worker_id=w
    and (
     (work_day=day_k and site_id=s.id)
     or clock_out is null
    )
  order by clock_in desc
  limit 1;

  if rec.id is not null then
   if rec.site_id=s.id and rec.work_day=day_k then
    return jsonb_build_object(
     'success',true,
     'message','이미 출근이 기록되어 있습니다.'
    );
   end if;

   raise exception '이전 출근 기록의 퇴근을 먼저 처리해주세요.';
  end if;

  select * into cfg
  from public.attendance_settings
  where company_id=c;

  if cfg.company_id is null then
   raise exception '관리자가 출퇴근 기준을 먼저 저장해야 합니다.';
  end if;

  select * into loc
  from public.attendance_locations
  where site_id=s.id and company_id=c and address=s.address;

  rec.site_lat:=loc.latitude;
  rec.site_lng:=loc.longitude;
  rec.radius_m:=cfg.radius_m;
 end if;

 gps:=p_body->'gps';
 lat:=(gps->>'latitude')::double precision;
 lng:=(gps->>'longitude')::double precision;
 accuracy:=(gps->>'accuracy')::double precision;

 if lat is null or lng is null or accuracy is null then
  if length(trim(coalesce(p_body->>'reason','')))<3 then
   raise exception '위치를 확인할 수 없으면 사유를 입력해주세요.';
  end if;

  gps:=jsonb_build_object(
   'reason',left(p_body->>'reason',300)
  );
 else
  if not(lat between -90 and 90)
     or not(lng between -180 and 180)
     or not(accuracy between 0 and 100000) then
   raise exception 'GPS 값이 올바르지 않습니다.';
  end if;

  gps:=jsonb_build_object(
   'latitude',lat,
   'longitude',lng,
   'accuracy',accuracy
  );

  if rec.site_lat is not null then
   distance_m:=round(
    6371000*2*asin(
     sqrt(
      least(
       1.0,
       power(sin(radians(lat-rec.site_lat)/2),2)
       +cos(radians(rec.site_lat))
       *cos(radians(lat))
       *power(sin(radians(lng-rec.site_lng)/2),2)
      )
     )
    )
   )::integer;

   verified:=accuracy<=100 and distance_m+accuracy<=rec.radius_m;
  end if;
 end if;

 if p_action='in' then
  insert into public.attendance_records(
   company_id,site_id,worker_id,work_day,
   clock_in,in_gps,in_distance_m,in_verified,
   site_address,site_lat,site_lng,radius_m,cutoff,hourly_rate
  )
  values(
   c,s.id,w,day_k,t,gps,distance_m,verified,
   coalesce(s.address,''),
   loc.latitude,loc.longitude,
   cfg.radius_m,cfg.cutoff,cfg.hourly_rate
  );
 else
  cutoff_at:=(rec.work_day+rec.cutoff) at time zone 'Asia/Seoul';

  minutes:=greatest(
   0,
   floor(
    extract(epoch from(t-greatest(rec.clock_in,cutoff_at)))/60
   )
  )::integer;

  update public.attendance_records set
   clock_out=t,
   out_gps=gps,
   out_distance_m=distance_m,
   out_verified=verified,
   overtime_minutes=minutes
  where id=rec.id;
 end if;

 return jsonb_build_object(
  'success',true,
  'message',
  case
   when verified then '시간과 위치를 기록했습니다.'
   else '시간을 기록했습니다. 위치는 관리자 확인이 필요합니다.'
  end
 );
end
$$;

revoke all on function public.attendance_action(uuid,text,jsonb)
 from public,anon,authenticated;

grant execute on function public.attendance_action(uuid,text,jsonb)
 to service_role;
