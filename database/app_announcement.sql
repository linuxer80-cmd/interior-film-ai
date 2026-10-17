begin;
create table if not exists public.app_announcement (
  id integer primary key check (id = 1),
  message text not null default '' check (char_length(message) <= 500),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (not enabled or length(btrim(message)) > 0)
);
alter table public.app_announcement enable row level security;
revoke all on public.app_announcement from public, anon, authenticated;
grant select, insert, update on public.app_announcement to service_role;
insert into public.app_announcement (id) values (1) on conflict (id) do nothing;
commit;
select '한 줄 공지사항 설정 완료' as result;
