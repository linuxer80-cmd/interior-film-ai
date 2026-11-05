begin;
alter table public.calendar_auto_events add column if not exists site_id uuid;
alter table public.calendar_auto_events add column if not exists company_id uuid;
-- No cascading FK: retain provenance until the remote event is verified gone.
create or replace function app_private.bind_calendar_event_scope()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare co uuid; expected text;
begin
 if tg_op='UPDATE' and old.site_id is not null then
  if new.site_id is null then new.site_id:=old.site_id;end if;
  if new.company_id is null then new.company_id:=old.company_id;end if;
  if new.site_id is distinct from old.site_id or new.company_id is distinct from old.company_id
   or new.user_id is distinct from old.user_id or new.event_id is distinct from old.event_id
   or new.work_date is distinct from old.work_date then raise exception 'Calendar event scope is immutable';end if;
  return new;
 end if;
 -- Older app versions may still write unattributed rows. They remain unknown,
 -- never evidence of a complete company deletion inventory.
 if new.site_id is null then
  if new.company_id is not null then raise exception 'Calendar site required';end if;
  return new;
 end if;
 select company_id into co from public.sites where id=new.site_id for share;
 if co is null then raise exception 'Calendar site not found';end if;
 if new.company_id is not null and new.company_id<>co then raise exception 'Calendar company mismatch';end if;
 expected:='fm'||encode(sha256(convert_to('filmjang-v1:'||new.user_id::text||':'||new.site_id::text||':'||to_char(new.work_date,'YYYY-MM-DD'),'UTF8')),'hex');
 if new.event_id is distinct from expected then raise exception 'Calendar event identity mismatch';end if;
 new.company_id:=co;
 return new;
end;$f$;
revoke all on function app_private.bind_calendar_event_scope() from public,anon,authenticated;
drop trigger if exists bind_calendar_event_scope on public.calendar_auto_events;
create trigger bind_calendar_event_scope before insert or update on public.calendar_auto_events
for each row execute function app_private.bind_calendar_event_scope();
commit;
