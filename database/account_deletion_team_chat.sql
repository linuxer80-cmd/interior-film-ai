begin;
alter table public.worker_team_messages alter column sender_id drop not null;
alter table public.worker_team_messages drop constraint if exists deleted_team_sender_body;
alter table public.worker_team_messages add constraint deleted_team_sender_body check(sender_id is not null or body='탈퇴로 삭제된 메시지입니다.');
create or replace function public.scrub_account_team_chat(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid; ids uuid[];
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 perform 1 from public.worker_team_messages where sender_id=u order by id for update;
 select coalesce(array_agg(id),'{}'::uuid[]) into ids from public.worker_team_messages where sender_id=u;
 delete from public.worker_team_message_reads where user_id=u or message_id=any(ids);
 update public.worker_team_messages set sender_id=null,body='탈퇴로 삭제된 메시지입니다.' where id=any(ids);
 if exists(select 1 from public.worker_team_messages where sender_id=u)
 or exists(select 1 from public.worker_team_message_reads where user_id=u or message_id=any(ids)) then raise exception 'Team chat cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_team_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_team_chat(uuid,uuid) to service_role;
create or replace function app_private.guard_deleting_team_sender()
returns trigger language plpgsql security definer set search_path=''
as $f$ begin
 if new.sender_id is not null then
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.sender_id::text,812437));
 if exists(select 1 from public.account_deletion_blocks where user_id=new.sender_id) then
 raise exception 'Account deletion in progress' using errcode='42501'; end if;
 end if;
 return new;
end;$f$;
revoke all on function app_private.guard_deleting_team_sender() from public,anon,authenticated;
drop trigger if exists guard_deleting_team_sender on public.worker_team_messages;
create trigger guard_deleting_team_sender before insert or update on public.worker_team_messages for each row execute function app_private.guard_deleting_team_sender();
-- Existing notifier sends only a refresh signal, never the deleted message body.
drop trigger if exists team_chat_deletion_invalidation on public.worker_team_messages;
create trigger team_chat_deletion_invalidation after update of sender_id,body on public.worker_team_messages
 for each row when (old.sender_id is not null and new.sender_id is null)
 execute function app_private.notify_team_chat_change();
commit;
