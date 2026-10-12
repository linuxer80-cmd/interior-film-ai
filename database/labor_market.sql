begin;

-- 기존 계좌·주소 기능이 없는 경우에도 필요한 테이블을 생성합니다.
create table if not exists public.worker_private_details (
  worker_id uuid primary key
    references public.workers(id) on delete cascade,
  company_id uuid not null
    references public.companies(id) on delete cascade,
  bank_name text not null default ''
    check (length(bank_name) <= 100),
  account_number text not null default ''
    check (length(account_number) <= 50),
  account_holder text not null default ''
    check (length(account_holder) <= 100),
  departure_address text not null default ''
    check (length(departure_address) <= 300),
  updated_at timestamptz not null default now()
);

alter table public.worker_private_details enable row level security;

revoke all on public.worker_private_details
from public, anon, authenticated;

grant select, insert, update, delete
on public.worker_private_details to service_role;

create table if not exists public.labor_profiles (
  user_id uuid primary key
    references auth.users(id) on delete cascade,
  name text not null
    check (length(name) between 1 and 60),
  age integer check (age between 18 and 100),
  daily_wage integer not null default 0
    check (daily_wage between 0 and 2000000),
  region text not null default ''
    check (length(region) <= 100),
  skills text[] not null default '{}',
  experience_years integer not null default 0
    check (experience_years between 0 and 70),
  introduction text not null default ''
    check (length(introduction) <= 1500),
  available_dates date[] not null default '{}',
  seeking boolean not null default false,
  published boolean not null default false,
  photo_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_personal_details (
  user_id uuid primary key
    references public.labor_profiles(user_id) on delete cascade,
  phone text not null default '',
  bank_name text not null default '',
  account_number text not null default '',
  account_holder text not null default '',
  departure_address text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null
    check (length(title) between 1 and 100),
  region text not null
    check (length(region) between 1 and 100),
  address text not null
    check (length(address) between 1 and 300),
  work_content text not null
    check (length(work_content) between 1 and 2000),
  work_date date not null,
  end_date date not null,
  daily_wage integer not null
    check (daily_wage between 1 and 2000000),
  headcount integer not null
    check (headcount between 1 and 100),
  skills text[] not null default '{}',
  min_experience integer not null default 0
    check (min_experience between 0 and 70),
  status text not null default 'open'
    check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  check (end_date >= work_date)
);

create table if not exists public.labor_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null
    references public.labor_jobs(id) on delete cascade,
  user_id uuid not null
    references public.labor_profiles(user_id) on delete cascade,
  status text not null
    check (
      status in (
        'invited',
        'applied',
        'accepted',
        'rejected',
        'withdrawn'
      )
    ),
  share_phone boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(job_id, user_id)
);

create index if not exists labor_profiles_search_idx
on public.labor_profiles(seeking, published, updated_at desc);

create index if not exists labor_jobs_company_idx
on public.labor_jobs(company_id, created_at desc);

create index if not exists labor_jobs_open_idx
on public.labor_jobs(status, end_date);

create index if not exists labor_applications_user_idx
on public.labor_applications(user_id);

alter table public.labor_profiles enable row level security;
alter table public.labor_personal_details enable row level security;
alter table public.labor_jobs enable row level security;
alter table public.labor_applications enable row level security;

revoke all on
  public.labor_profiles,
  public.labor_personal_details,
  public.labor_jobs,
  public.labor_applications
from public, anon, authenticated;

grant select, insert, update, delete on
  public.labor_profiles,
  public.labor_personal_details,
  public.labor_jobs,
  public.labor_applications
to service_role;

-- 서버에서 인증한 본인의 user_id만 전달합니다.
-- 개인설정과 소속업체 계좌를 한 트랜잭션으로 저장합니다.
create or replace function public.save_labor_profile(
  p_user_id uuid,
  p_profile jsonb,
  p_private jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.labor_profiles (
    user_id,
    name,
    age,
    daily_wage,
    region,
    skills,
    experience_years,
    introduction,
    available_dates,
    seeking,
    published
  )
  values (
    p_user_id,
    p_profile->>'name',
    (p_profile->>'age')::integer,
    (p_profile->>'daily_wage')::integer,
    p_profile->>'region',
    array(
      select jsonb_array_elements_text(p_profile->'skills')
    ),
    (p_profile->>'experience_years')::integer,
    p_profile->>'introduction',
    array(
      select value::date
      from jsonb_array_elements_text(
        p_profile->'available_dates'
      ) as t(value)
    ),
    (p_profile->>'seeking')::boolean,
    (p_profile->>'published')::boolean
  )
  on conflict(user_id) do update set
    name = excluded.name,
    age = excluded.age,
    daily_wage = excluded.daily_wage,
    region = excluded.region,
    skills = excluded.skills,
    experience_years = excluded.experience_years,
    introduction = excluded.introduction,
    available_dates = excluded.available_dates,
    seeking = excluded.seeking,
    published = excluded.published,
    updated_at = now();

  insert into public.labor_personal_details (
    user_id,
    phone,
    bank_name,
    account_number,
    account_holder,
    departure_address
  )
  values (
    p_user_id,
    p_private->>'phone',
    p_private->>'bank_name',
    p_private->>'account_number',
    p_private->>'account_holder',
    p_private->>'departure_address'
  )
  on conflict(user_id) do update set
    phone = excluded.phone,
    bank_name = excluded.bank_name,
    account_number = excluded.account_number,
    account_holder = excluded.account_holder,
    departure_address = excluded.departure_address,
    updated_at = now();

  insert into public.worker_private_details (
    worker_id,
    company_id,
    bank_name,
    account_number,
    account_holder,
    departure_address
  )
  select
    w.id,
    w.company_id,
    p_private->>'bank_name',
    p_private->>'account_number',
    p_private->>'account_holder',
    p_private->>'departure_address'
  from public.workers w
  join public.companies c on c.id = w.company_id
  where w.user_id = p_user_id
    and w.is_active is not false
    and c.is_active is not false
  on conflict(worker_id) do update set
    bank_name = excluded.bank_name,
    account_number = excluded.account_number,
    account_holder = excluded.account_holder,
    departure_address = excluded.departure_address,
    updated_at = now();
end;
$$;

revoke all on function
public.save_labor_profile(uuid, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function
public.save_labor_profile(uuid, jsonb, jsonb)
to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'labor-avatars',
  'labor-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict(id) do nothing;

-- 기존 Storage 정책이 광범위하더라도 이 버킷은
-- 서버를 통해서만 접근합니다.
drop policy if exists labor_avatars_server_only
on storage.objects;

create policy labor_avatars_server_only
on storage.objects
as restrictive
for all
to anon, authenticated
using (bucket_id <> 'labor-avatars')
with check (bucket_id <> 'labor-avatars');

commit;
