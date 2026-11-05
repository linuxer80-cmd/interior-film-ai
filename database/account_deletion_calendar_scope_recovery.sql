begin;
create or replace function public.recover_calendar_event_scope(p_bindings jsonb)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare b record; current_row record; co uuid; seen text[]:='{}'; k text;
begin
 if jsonb_typeof(p_bindings) is distinct from 'array' then raise exception 'Calendar bindings must be an array';end if;
 if jsonb_array_length(p_bindings)>1000 then raise exception 'Calendar recovery batch too large';end if;
 lock table public.sites in share mode;
 lock table public.calendar_auto_events in share row exclusive mode;
 for b in select * from jsonb_to_recordset(p_bindings) as x(user_id uuid,event_id text,work_date date,site_id uuid,company_id uuid) loop
  if b.user_id is null or b.event_id is null or b.work_date is null or b.site_id is null or b.company_id is null then raise exception 'Incomplete calendar binding';end if;
  k:=b.user_id::text||':'||b.event_id;
  if k=any(seen) then raise exception 'Duplicate calendar binding';end if;seen:=array_append(seen,k);
  select * into current_row from public.calendar_auto_events where user_id=b.user_id and event_id=b.event_id for update;
  if not found or current_row.work_date is distinct from b.work_date then raise exception 'Calendar ledger changed';end if;
  select company_id into co from public.sites where id=b.site_id;
  if co is distinct from b.company_id then raise exception 'Calendar site ownership changed';end if;
  -- The binding trigger independently checks the deterministic event ID.
  update public.calendar_auto_events set site_id=b.site_id,company_id=b.company_id where user_id=b.user_id and event_id=b.event_id;
 end loop;
 return true;
end;$f$;
revoke all on function public.recover_calendar_event_scope(jsonb) from public,anon,authenticated;
grant execute on function public.recover_calendar_event_scope(jsonb) to service_role;
commit;
