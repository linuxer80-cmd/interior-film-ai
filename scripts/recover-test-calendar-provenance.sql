-- Isolated TEST database only. Updates provenance, never remote events.
-- Requires account_deletion_calendar_event_scope.sql and
-- account_deletion_calendar_scope_recovery.sql. Unmatched rows remain unknown.
select public.recover_calendar_event_scope(coalesce(jsonb_agg(jsonb_build_object(
 'user_id',user_id,'event_id',event_id,'work_date',work_date,
 'site_id',site_id,'company_id',company_id)),'[]'::jsonb)) as recovered
from (
 select e.user_id,e.event_id,e.work_date,s.id as site_id,s.company_id,
 count(*) over(partition by e.user_id,e.event_id) as matches
 from public.calendar_auto_events e join public.sites s on
 e.event_id='fm'||encode(sha256(convert_to('filmjang-v1:'||e.user_id::text||':'||s.id::text||':'||to_char(e.work_date,'YYYY-MM-DD'),'UTF8')),'hex')
 where e.site_id is null and e.company_id is null
) matched where matches=1;
