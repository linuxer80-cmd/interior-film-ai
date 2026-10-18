begin;
create table if not exists public.worker_team_messages (
 id uuid primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 site_id uuid not null references public.sites(id) on delete cascade,
 work_date date not null,
 sender_id uuid not null references auth.users(id),
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists worker_team_message_order on public.worker_team_messages(company_id,site_id,work_date,created_at desc,id desc);
alter table public.worker_team_messages enable row level security;
revoke all on public.worker_team_messages from public,anon,authenticated;
grant select,insert on public.worker_team_messages to service_role;
commit;
select '팀원 채팅 설정 완료' as result;
