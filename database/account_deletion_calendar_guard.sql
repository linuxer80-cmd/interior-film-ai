begin;
create or replace function public.guard_deleting_calendar_connection()
returns trigger language plpgsql security definer set search_path=''
as $f$
begin
 if TG_TABLE_NAME='calendar_auto_connections' and TG_OP='UPDATE'
 and (to_jsonb(new)->'user_id',to_jsonb(new)->'refresh_cipher',to_jsonb(new)->'generation',to_jsonb(new)->'enabled')
 is not distinct from (to_jsonb(old)->'user_id',to_jsonb(old)->'refresh_cipher',to_jsonb(old)->'generation',to_jsonb(old)->'enabled')
 then return new; end if;
 if exists(select 1 from public.account_deletion_blocks where user_id=new.user_id)
 then raise exception 'Account deletion in progress' using errcode='42501'; end if;
 return new;
end;$f$;
revoke all on function public.guard_deleting_calendar_connection() from public,anon,authenticated;
drop trigger if exists guard_deleting_calendar on public.calendar_auto_connections;
create trigger guard_deleting_calendar before insert or update on public.calendar_auto_connections
for each row execute function public.guard_deleting_calendar_connection();
drop trigger if exists guard_deleting_calendar_pending on public.calendar_auto_pending;
create trigger guard_deleting_calendar_pending before insert or update on public.calendar_auto_pending
for each row execute function public.guard_deleting_calendar_connection();
commit;
