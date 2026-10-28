-- Only send a content-free invalidation; the existing API enforces access again.
create or replace function app_private.can_receive_team_chat(p_topic text)
returns boolean language sql stable security definer set search_path = ''
as $$
 select coalesce(exists (
  select 1 from public.sites s
  join public.companies c on c.id = s.company_id and c.is_active is not false
  where auth.uid() is not null
   and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active is false)
   and (
    exists (select 1 from public.profiles p where p.id=auth.uid() and p.company_id=s.company_id and p.role='owner' and p.is_active is not false
      and p_topic like 'team-chat:' || s.id::text || ':%')
    or exists (select 1 from public.site_daily_assignments a
      join public.workers w on w.id=a.worker_id and w.company_id=s.company_id and w.user_id=auth.uid() and w.is_active is true
      where a.company_id=s.company_id and a.site_id=s.id
        and s.status is distinct from 'cancelled'
        and (s.work_dates is null or a.work_date=any(s.work_dates))
        and p_topic = 'team-chat:' || s.id::text || ':' || a.work_date::text)
   )
 ), false)
$$;
revoke all on function app_private.can_receive_team_chat(text) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.can_receive_team_chat(text) to authenticated;

create policy "team chat receive invalidations" on realtime.messages for select to authenticated
using (extension = 'broadcast' and app_private.can_receive_team_chat((select realtime.topic())));

create or replace function app_private.notify_team_chat_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_site uuid; v_date date;
begin
 if tg_table_name='worker_team_messages' then
  v_site := new.site_id; v_date := new.work_date;
 else
  if new.read_at is not distinct from old.read_at then return null; end if;
  select m.site_id, m.work_date into v_site,v_date from public.worker_team_messages m where m.id=new.message_id;
 end if;
 if v_site is not null and v_date is not null then
  begin
   perform realtime.send('{}'::jsonb, 'changed', 'team-chat:' || v_site::text || ':' || v_date::text, true);
  exception when others then
   raise warning 'team chat notification failed: %', sqlstate;
  end;
 end if;
 return null;
end $$;
revoke all on function app_private.notify_team_chat_change() from public, anon, authenticated;
create trigger team_chat_message_invalidation after insert on public.worker_team_messages
for each row execute function app_private.notify_team_chat_change();
create trigger team_chat_read_invalidation after update of read_at on public.worker_team_message_reads
for each row execute function app_private.notify_team_chat_change();
