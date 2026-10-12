-- 기존 labor_market.sql과 site_daily_assignments.sql 적용 후 실행합니다.
begin;

alter table public.labor_profiles
  add column if not exists direct_hire_consent boolean not null default false;

alter table public.labor_jobs
  add column if not exists site_id uuid references public.sites(id);

alter table public.labor_jobs
  add column if not exists work_dates date[] not null default '{}';

alter table public.labor_jobs
  add column if not exists min_age integer check (min_age between 18 and 100);

alter table public.labor_jobs
  add column if not exists max_age integer check (max_age between 18 and 100);

alter table public.labor_jobs
  add column if not exists worker_region text not null default '';

alter table public.labor_jobs alter column daily_wage drop not null;
alter table public.labor_jobs alter column min_experience drop not null;

alter table public.labor_applications
  drop constraint if exists labor_applications_status_check;

alter table public.labor_applications
  add constraint labor_applications_status_check
  check (
    status in (
      'invited','applied','accepted','rejected','withdrawn','expired','unassigned'
    )
  );

create index if not exists labor_jobs_site_idx
  on public.labor_jobs(site_id);

create table if not exists public.labor_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.labor_jobs(id) on delete cascade,
  title text not null,
  message text not null,
  link text not null,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists labor_notifications_user_idx
  on public.labor_notifications(user_id,created_at desc);

alter table public.labor_notifications enable row level security;

revoke all on public.labor_notifications from public,anon,authenticated;
grant select,insert,update,delete on public.labor_notifications to service_role;

-- 모집 상태, 배정, 알림은 동일 트랜잭션에서 처리합니다.
-- 서버가 인증하고 권한을 검증한 사용자만 호출합니다.
create or replace function public.labor_action(
  p_actor uuid,
  p_job uuid,
  p_action text,
  p_target uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  j public.labor_jobs;
  a public.labor_applications;
  lp public.labor_profiles;
  wid uuid;
  manager boolean;
  today date := (now() at time zone 'Asia/Seoul')::date;
  target uuid;
  selected_count integer;
  closing boolean := false;
begin
  select * into j
  from public.labor_jobs
  where id=p_job
  for update;

  if not found then
    raise exception '공고를 찾을 수 없습니다.';
  end if;

  manager := exists(
    select 1
    from public.profiles p
    join public.companies c on c.id=p.company_id
    where p.id=p_actor
      and p.role='owner'
      and p.is_active is not false
      and c.is_active is not false
      and c.id=j.company_id
  );

  if p_action in (
    'close','finish','invite','accept','reject','direct_hire'
  ) and not manager then
    raise exception '본인 업체의 공고만 관리할 수 있습니다.';
  end if;

  if p_action in ('apply','withdraw') and manager then
    raise exception '본인 업체의 공고에는 지원할 수 없습니다.';
  end if;

  target := case
    when p_action in ('invite','accept','reject','direct_hire')
      then p_target
    else p_actor
  end;

  if p_action not in (
    'close','finish','invite','accept','reject','direct_hire','apply','withdraw'
  ) then
    raise exception '요청을 확인해주세요.';
  end if;

  if p_action in ('invite','apply','accept','direct_hire','finish')
    and (j.status<>'open' or j.end_date<today)
  then
    raise exception '마감된 구인입니다.';
  end if;

  if p_action not in ('close','finish') then
    select * into lp
    from public.labor_profiles
    where user_id=target;

    if not found then
      raise exception '시공자 프로필을 등록해주세요.';
    end if;

    if exists(
      select 1
      from public.profiles
      where id=target and is_active is false
    ) then
      raise exception '활성 시공자 계정만 지원·채용할 수 있습니다.';
    end if;

    select * into a
    from public.labor_applications
    where job_id=j.id and user_id=target
    for update;
  end if;

  if p_action in ('apply','invite')
    and (
      select count(*)
      from public.labor_applications
      where job_id=j.id and status='accepted'
    )>=j.headcount
  then
    raise exception '필요 인원이 모두 선택되었습니다.';
  end if;

  if p_action='apply' then
    if a.status is not null and a.status not in ('invited','withdrawn','unassigned') then
      raise exception '이미 처리된 지원입니다.';
    end if;

    if not exists(
      select 1
      from public.labor_personal_details
      where user_id=target and phone<>''
    ) then
      raise exception '전화번호를 등록해주세요.';
    end if;

    insert into public.labor_applications(
      job_id,user_id,status,share_phone
    )
    values(j.id,target,'applied',true)
    on conflict(job_id,user_id) do update
      set status='applied',
          share_phone=true,
          updated_at=now();

    insert into public.labor_notifications(
      user_id,job_id,title,message,link
    )
    select
      p.id,
      j.id,
      '새로운 시공자 지원',
      lp.name || '님이 ' || j.title || ' 공고에 지원했습니다.',
      '/jobs?mine=1&job=' || j.id || '&applicant=' || target
    from public.profiles p
    where p.company_id=j.company_id
      and p.role='owner'
      and p.is_active is not false;

  elsif p_action='invite' then
    if not lp.seeking or not lp.published
      or (
        a.status is not null
        and a.status not in ('withdrawn','rejected')
      )
    then
      raise exception '현재 제안할 수 없는 시공자입니다.';
    end if;

    insert into public.labor_applications(
      job_id,user_id,status,share_phone
    )
    values(j.id,target,'invited',false)
    on conflict(job_id,user_id) do update
      set status='invited',
          share_phone=false,
          updated_at=now();

    insert into public.labor_notifications(
      user_id,job_id,title,message,link
    )
    values(
      target,
      j.id,
      '구인 제안',
      j.title || ' 공고의 구인 제안이 도착했습니다.',
      '/jobs?view=worker&job=' || j.id
    );

  elsif p_action='withdraw' then
    if a.status is null or a.status not in ('invited','applied') then
      raise exception '현재 취소할 수 없는 지원입니다. 채용 후 변경은 업체에 문의해주세요.';
    end if;

    update public.labor_applications
    set status='withdrawn',
        share_phone=false,
        updated_at=now()
    where id=a.id;

  elsif p_action='reject' then
    if a.status is null or a.status not in ('invited','applied') then
      raise exception '현재 처리할 수 없는 지원입니다.';
    end if;

    update public.labor_applications
    set status='expired',
        share_phone=false,
        updated_at=now()
    where id=a.id;

    insert into public.labor_notifications(
      user_id,job_id,title,message,link
    )
    values(
      target,
      j.id,
      '지원이 만료되었습니다',
      j.title || ' 공고에서 선택되지 않아 지원이 만료되었습니다.',
      '/jobs?view=worker&job=' || j.id
    );

  elsif p_action in ('accept','direct_hire') then
    select count(*) into selected_count
    from public.labor_applications
    where job_id=j.id and status='accepted';

    if selected_count>=j.headcount then
      raise exception '필요 인원이 모두 채워졌습니다. 구인 완료를 눌러주세요.';
    end if;

    if p_action='direct_hire' then
      -- 구직 공개 시 동의한 날짜와 조건에 한해서 직접 배정합니다.
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(target::text,0)
      );

      select * into lp
      from public.labor_profiles
      where user_id=target
      for update;

      if not lp.seeking or not lp.published or not lp.direct_hire_consent then
        raise exception '시공자가 구직하기에서 현장 배정 동의를 먼저 해야 합니다.';
      end if;

      if exists(
        select 1
        from public.profiles
        where id=target
          and company_id=j.company_id
          and role='owner'
      ) then
        raise exception '본인 업체의 관리자에게 구인할 수 없습니다.';
      end if;

      if cardinality(j.work_dates)=0
        or not (j.work_dates <@ lp.available_dates)
      then
        raise exception '공고의 모든 시공일이 시공자가 원하는 날짜와 일치해야 합니다.';
      end if;

      if j.daily_wage is not null and j.daily_wage<lp.daily_wage then
        raise exception '희망 일당 이상의 현장을 선택해주세요.';
      end if;

      if not exists(
        select 1
        from public.labor_personal_details
        where user_id=target and phone<>''
      ) then
        raise exception '시공자 연락처를 확인해주세요.';
      end if;

      if a.status='accepted' then
        raise exception '이미 배정된 시공자입니다.';
      end if;

      insert into public.labor_applications(
        job_id,user_id,status,share_phone
      )
      values(j.id,target,'applied',true)
      on conflict(job_id,user_id) do update
        set status='applied',
            share_phone=true,
            updated_at=now();

      select * into a
      from public.labor_applications
      where job_id=j.id and user_id=target;
    end if;

    if a.status is null or a.status<>'applied' then
      raise exception '지원한 시공자만 선택할 수 있습니다.';
    end if;

    if j.site_id is null or not exists(
      select 1
      from public.sites
      where id=j.site_id
        and company_id=j.company_id
        and status not in ('cancelled','completed')
    ) then
      raise exception '진행할 현장이 연결되어 있어야 합니다.';
    end if;

    if exists(
      select 1
      from public.sites s
      where s.id=j.site_id
        and s.work_dates is not null
        and not (j.work_dates <@ s.work_dates)
    ) then
      raise exception '현장 일정이 변경되었습니다. 공고를 다시 등록해주세요.';
    end if;

    if cardinality(j.work_dates)=0 then
      raise exception '배정할 시공 날짜가 없습니다.';
    end if;

    if exists(
      select 1 from unnest(j.work_dates) d where d<today
    ) then
      raise exception '지난 작업 날짜가 있습니다. 새 공고를 등록해주세요.';
    end if;

    -- 동시에 채용해도 같은 시공자를 중복 생성하지 않습니다.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(target::text,0)
    );

    select id into wid
    from public.workers
    where company_id=j.company_id
      and user_id=target
      and is_active is not false
    order by created_at
    limit 1;

    if wid is null then
      if exists(
        select 1
        from public.workers
        where company_id=j.company_id
          and user_id=target
          and is_active is false
      ) then
        raise exception '중지된 시공자는 관리자 시공자 설정에서 확인해주세요.';
      end if;

      insert into public.workers(
        company_id,user_id,name,phone,position,is_active,daily_wage
      )
      select
        j.company_id,
        target,
        lp.name,
        p.phone,
        '시공자',
        true,
        coalesce(j.daily_wage,lp.daily_wage)
      from public.labor_personal_details p
      where p.user_id=target
      returning id into wid;
    end if;

    if wid is null then
      raise exception '시공자 연락처를 확인해주세요.';
    end if;

    if exists(
      select 1
      from public.site_daily_assignments d
      join public.workers w on w.id=d.worker_id
      join public.sites assigned_site on assigned_site.id=d.site_id and assigned_site.company_id=d.company_id
      where assigned_site.status not in ('cancelled','completed')
        and (assigned_site.work_dates is null or d.work_date=any(assigned_site.work_dates))
        and w.user_id=target
        and d.work_date=any(j.work_dates)
        and d.site_id<>j.site_id
    ) then
      raise exception '해당 날짜에 다른 현장 배정이 있습니다.';
    end if;

    insert into public.site_workers(
      company_id,site_id,worker_id,role
    )
    select j.company_id,j.site_id,wid,'member'
    where not exists(
      select 1
      from public.site_workers
      where site_id=j.site_id and worker_id=wid
    );

    insert into public.site_daily_assignments(
      company_id,site_id,work_date,worker_id,role
    )
    select j.company_id,j.site_id,d,wid,'member'
    from unnest(j.work_dates) d
    on conflict(site_id,work_date,worker_id) do nothing;

    insert into public.worker_private_details(
      worker_id,company_id,bank_name,
      account_number,account_holder,departure_address
    )
    select
      wid,
      j.company_id,
      p.bank_name,
      p.account_number,
      p.account_holder,
      p.departure_address
    from public.labor_personal_details p
    where p.user_id=target
    on conflict(worker_id) do nothing;

    update public.labor_applications
    set status='accepted',
        updated_at=now()
    where id=a.id;

    insert into public.labor_notifications(
      user_id,job_id,title,message,link
    )
    values(
      target,
      j.id,
      '구인이 확정되었습니다',
      j.title || ' 현장에 배정되었습니다. 내 현장에서 확인해주세요.',
      '/worker/site/' || j.site_id
    );

    select count(*) into selected_count
    from public.labor_applications
    where job_id=j.id and status='accepted';

    update public.labor_profiles
    set seeking=false,
        direct_hire_consent=false,
        updated_at=now()
    where user_id=target;

  elsif p_action='finish' then
    select count(*) into selected_count
    from public.labor_applications
    where job_id=j.id and status='accepted';

    if selected_count<j.headcount then
      raise exception '필요 인원을 모두 선택한 후 구인 완료를 눌러주세요.';
    end if;

    closing := true;

  elsif p_action='close' then
    closing := j.status='open';
  end if;

  if closing then
    update public.labor_jobs
    set status='closed'
    where id=j.id;

    insert into public.labor_notifications(
      user_id,job_id,title,message,link
    )
    select
      user_id,
      j.id,
      '지원이 만료되었습니다',
      j.title || ' 모집이 종료되어 지원이 만료되었습니다.',
      '/jobs?view=worker&job=' || j.id
    from public.labor_applications
    where job_id=j.id and status in ('applied','invited');

    update public.labor_applications
    set status='expired',
        share_phone=false,
        updated_at=now()
    where job_id=j.id and status in ('applied','invited');
  end if;

  return jsonb_build_object(
    'ok',true,
    'siteId',case
      when p_action in ('accept','direct_hire') then j.site_id
      else null
    end
  );
end;
$$;

revoke all on function public.labor_action(uuid,uuid,text,uuid)
  from public,anon,authenticated;

grant execute on function public.labor_action(uuid,uuid,text,uuid)
  to service_role;

-- 정기 실행과 게시판 진입 시 호출합니다.
-- 이미 만료된 공고에는 중복 알림을 만들지 않습니다.
create or replace function public.expire_labor_jobs()
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  j public.labor_jobs;
begin
  for j in
    select *
    from public.labor_jobs
    where status='open'
      and end_date<(now() at time zone 'Asia/Seoul')::date
    for update skip locked
  loop
    insert into public.labor_notifications(
      user_id,job_id,title,message,link
    )
    select
      user_id,
      j.id,
      '지원이 만료되었습니다',
      j.title || ' 모집 기간이 종료되었습니다.',
      '/jobs?view=worker&job=' || j.id
    from public.labor_applications
    where job_id=j.id and status in ('applied','invited');

    update public.labor_applications
    set status='expired',
        share_phone=false,
        updated_at=now()
    where job_id=j.id and status in ('applied','invited');

    update public.labor_jobs
    set status='closed'
    where id=j.id;
  end loop;
end;
$$;

revoke all on function public.expire_labor_jobs()
  from public,anon,authenticated;

grant execute on function public.expire_labor_jobs()
  to service_role;

-- 현장 정보 전송, 공고 생성, 배정을 한 트랜잭션으로 처리합니다.
-- 실패하면 새 공고와 배정 모두 취소됩니다.
create or replace function public.create_labor_direct_job(
  p_actor uuid,
  p_target uuid,
  p_job jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  j public.labor_jobs;
  jid uuid;
begin
  select * into j
  from jsonb_populate_record(null::public.labor_jobs,p_job);

  if not exists(
    select 1
    from public.profiles p
    join public.companies c on c.id=p.company_id
    where p.id=p_actor
      and p.role='owner'
      and p.is_active is not false
      and c.is_active is not false
      and p.company_id=j.company_id
  ) then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if not exists(
    select 1
    from public.sites
    where id=j.site_id
      and company_id=j.company_id
      and status not in ('cancelled','completed')
  ) then
    raise exception '본인 업체의 진행할 현장을 선택해주세요.';
  end if;

  insert into public.labor_jobs(
    company_id,
    created_by,
    title,
    region,
    address,
    work_content,
    work_date,
    end_date,
    daily_wage,
    headcount,
    skills,
    min_experience,
    min_age,
    max_age,
    worker_region,
    site_id,
    work_dates
  )
  values(
    j.company_id,
    p_actor,
    j.title,
    j.region,
    j.region,
    j.work_content,
    j.work_date,
    j.end_date,
    j.daily_wage,
    1,
    j.skills,
    j.min_experience,
    j.min_age,
    j.max_age,
    j.worker_region,
    j.site_id,
    j.work_dates
  )
  returning id into jid;

  perform public.labor_action(
    p_actor,jid,'direct_hire',p_target
  );

  -- 직접 배정용 공고는 전송 즉시 완료합니다.
  -- 일반 구인 공고는 관리자가 구인 완료를 누릅니다.
  perform public.labor_action(
    p_actor,jid,'finish',null
  );

  return jsonb_build_object(
    'ok',true,
    'id',jid,
    'siteId',j.site_id
  );
end;
$$;

revoke all on function public.create_labor_direct_job(uuid,uuid,jsonb)
  from public,anon,authenticated;

grant execute on function public.create_labor_direct_job(uuid,uuid,jsonb)
  to service_role;

commit;
