-- Announcements are fetched from the existing authenticated API; the event
-- itself contains neither notice text nor user data.
create policy "announcement receive invalidations" on realtime.messages
for select to authenticated
using (extension='broadcast' and topic=(select realtime.topic())
 and (select auth.uid()) is not null
 and topic in ('announcement:owner','announcement:worker'));

create or replace function app_private.notify_announcement_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare notice_id integer;
begin
 notice_id := case when tg_op='DELETE' then old.id else new.id end;
 if notice_id in (1,2) then
  begin
   perform realtime.send('{}'::jsonb,'changed',case notice_id when 1 then 'announcement:owner' else 'announcement:worker' end,true);
  exception when others then raise warning 'announcement notification failed: %',sqlstate; end;
 end if;
 if tg_op='UPDATE' and old.id is distinct from new.id and old.id in (1,2) then
  begin
   perform realtime.send('{}'::jsonb,'changed',case old.id when 1 then 'announcement:owner' else 'announcement:worker' end,true);
  exception when others then raise warning 'announcement notification failed: %',sqlstate; end;
 end if;
 return null;
end $$;
revoke all on function app_private.notify_announcement_change() from public,anon,authenticated;
grant execute on function app_private.notify_announcement_change() to service_role;
create trigger announcement_realtime_invalidation after insert or update or delete on public.app_announcement
for each row execute function app_private.notify_announcement_change();
