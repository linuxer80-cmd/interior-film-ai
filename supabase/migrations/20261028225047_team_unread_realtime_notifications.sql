-- Each authenticated account can receive only its own content-free invalidations.
create policy "team unread receive own invalidations" on realtime.messages
for select to authenticated
using (extension = 'broadcast' and (select auth.uid()) is not null
  and (select realtime.topic()) = 'team-unread:' || (select auth.uid())::text);

-- Statement triggers coalesce read batches to one event per recipient, not one
-- event per message. The existing API still checks site and account access.
create or replace function app_private.notify_team_unread_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
 if tg_op = 'INSERT' then
  for recipient in select distinct user_id from new_rows where user_id is not null loop
   begin
    perform realtime.send('{}'::jsonb, 'changed', 'team-unread:' || recipient::text, true);
   exception when others then raise warning 'team unread notification failed: %', sqlstate; end;
  end loop;
 elsif tg_op = 'DELETE' then
  for recipient in select distinct user_id from old_rows where user_id is not null loop
   begin
    perform realtime.send('{}'::jsonb, 'changed', 'team-unread:' || recipient::text, true);
   exception when others then raise warning 'team unread notification failed: %', sqlstate; end;
  end loop;
 else
  for recipient in
   select distinct user_id from (
    select n.user_id from new_rows n left join old_rows o using (message_id,user_id)
     where o.message_id is null or n.read_at is distinct from o.read_at
    union
    select o.user_id from old_rows o left join new_rows n using (message_id,user_id)
     where n.message_id is null
   ) changed where user_id is not null
  loop
   begin
    perform realtime.send('{}'::jsonb, 'changed', 'team-unread:' || recipient::text, true);
   exception when others then raise warning 'team unread notification failed: %', sqlstate; end;
  end loop;
 end if;
 return null;
end $$;
revoke all on function app_private.notify_team_unread_change() from public, anon, authenticated;
create trigger team_unread_insert_invalidation after insert on public.worker_team_message_reads
referencing new table as new_rows for each statement execute function app_private.notify_team_unread_change();
create trigger team_unread_update_invalidation after update on public.worker_team_message_reads
referencing old table as old_rows new table as new_rows for each statement execute function app_private.notify_team_unread_change();
create trigger team_unread_delete_invalidation after delete on public.worker_team_message_reads
referencing old table as old_rows for each statement execute function app_private.notify_team_unread_change();
