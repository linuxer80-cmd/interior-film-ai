-- Deletes app-side credentials and ledger, not events in Google Calendar.
begin;
create or replace function public.scrub_account_calendar_connection(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid; c record;
begin
 select user_id into u from public.account_deletion_requests
 where id=p_request and lease_token=p_lease and lease_until>now()
 and identity_verified=true and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 select lease_id into c from public.calendar_auto_connections where user_id=u for update;
 if found and c.lease_id is not null then raise exception 'Calendar execution must stop before cleanup'; end if;
 delete from public.calendar_auto_pending where user_id=u;
 delete from public.calendar_auto_connections where user_id=u;
 delete from public.calendar_auto_events where user_id=u;
 return not exists(select 1 from public.calendar_auto_connections where user_id=u)
 and not exists(select 1 from public.calendar_auto_pending where user_id=u)
 and not exists(select 1 from public.calendar_auto_events where user_id=u);
end;$f$;
revoke all on function public.scrub_account_calendar_connection(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_calendar_connection(uuid,uuid) to service_role;
commit;
