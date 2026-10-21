begin;
alter table public.worker_team_messages add column if not exists read_tracking_initialized boolean not null default false;
alter table public.worker_team_messages alter column read_tracking_initialized set default true;
create table if not exists public.worker_team_message_reads (
 message_id uuid not null references public.worker_team_messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 read_at timestamptz,
 primary key(message_id,user_id)
);
alter table public.worker_team_message_reads enable row level security;
revoke all on public.worker_team_message_reads from public,anon,authenticated;
grant select,insert,update on public.worker_team_message_reads to service_role;

create or replace function app_private.team_message_recipients(co uuid,sid uuid,day date,sender uuid)
returns table(user_id uuid) language sql security invoker set search_path='' as $$
 select w.user_id from public.site_daily_assignments a
 join public.workers w on w.id=a.worker_id and w.company_id=a.company_id
 where a.company_id=co and a.site_id=sid and a.work_date=day
 and w.is_active=true and w.user_id is not null and w.user_id<>sender
 union
 select p.id from public.profiles p where p.company_id=co and p.role='owner'
 and p.is_active is distinct from false and p.id<>sender;
$$;
revoke all on function app_private.team_message_recipients(uuid,uuid,date,uuid) from public,anon,authenticated;
grant execute on function app_private.team_message_recipients(uuid,uuid,date,uuid) to service_role;

create or replace function app_private.capture_team_message_recipients()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.worker_team_message_reads(message_id,user_id)
 select new.id,r.user_id from app_private.team_message_recipients(new.company_id,new.site_id,new.work_date,new.sender_id) r
 on conflict do nothing;
 return new;
end $$;
revoke all on function app_private.capture_team_message_recipients() from public,anon,authenticated;
grant execute on function app_private.capture_team_message_recipients() to service_role;
drop trigger if exists capture_team_message_recipients on public.worker_team_messages;
create trigger capture_team_message_recipients after insert on public.worker_team_messages
for each row execute function app_private.capture_team_message_recipients();

-- Historical read status is unknown; initialize without claiming anyone already read it.
insert into public.worker_team_message_reads(message_id,user_id)
select m.id,r.user_id from public.worker_team_messages m
cross join lateral app_private.team_message_recipients(m.company_id,m.site_id,m.work_date,m.sender_id) r
where m.read_tracking_initialized=false
on conflict do nothing;
update public.worker_team_messages set read_tracking_initialized=true where read_tracking_initialized=false;

create or replace function public.team_message_read_counts(p_ids uuid[])
returns table(message_id uuid,unread_count bigint)
language sql security invoker set search_path='' as $$
 select r.message_id,count(*) filter(where r.read_at is null)
 from public.worker_team_message_reads r where r.message_id=any(p_ids)
 group by r.message_id;
$$;
revoke all on function public.team_message_read_counts(uuid[]) from public,anon,authenticated;
grant execute on function public.team_message_read_counts(uuid[]) to service_role;

create or replace function public.mark_team_messages_read(p_user uuid,p_company uuid,p_site uuid,p_date date,p_ids uuid[])
returns void language sql security invoker set search_path='' as $$
 update public.worker_team_message_reads r set read_at=clock_timestamp()
 from public.worker_team_messages m
 where r.message_id=m.id and r.user_id=p_user and r.read_at is null
 and m.company_id=p_company and m.site_id=p_site and m.work_date=p_date
 and m.id=any(p_ids);
$$;
revoke all on function public.mark_team_messages_read(uuid,uuid,uuid,date,uuid[]) from public,anon,authenticated;
grant execute on function public.mark_team_messages_read(uuid,uuid,uuid,date,uuid[]) to service_role;
commit;
select '팀 채팅 메시지 미확인 인원수 설정 완료' as result;
