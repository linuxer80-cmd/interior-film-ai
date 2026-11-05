begin;
-- Service-only remote verification receipt. The caller must GET-verify every
-- listed event is gone; SQL cannot establish remote absence on its own.
create or replace function public.clear_verified_company_calendar_ledger(p_request uuid,p_lease uuid,p_records jsonb)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid;u uuid;n bigint; expected jsonb;
begin
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 select company_deletion_id,user_id into co,u from public.account_deletion_requests where id=p_request;
 if co is null or u is null or not exists(select 1 from app_private.company_frozen_calendar_users where company_id=co and request_id=p_request and user_id=u) then raise exception 'Company calendar freeze required';end if;
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>10000 then raise exception 'Invalid calendar receipt';end if;
 lock table public.calendar_auto_events,app_private.company_calendar_scope_history in share row exclusive mode;
 expected:=public.inspect_company_calendar_deletion_ledger(p_request,p_lease);
 if exists(select 1 from public.calendar_auto_connections c join app_private.company_frozen_calendar_users f on f.user_id=c.user_id where f.company_id=co and c.lease_id is not null) then raise exception 'Calendar execution remains';end if;
 if exists(select 1 from jsonb_array_elements(p_records) r where jsonb_typeof(r)<>'object'
 or r->>'company_id' is distinct from co::text or coalesce(r->>'event_id','') !~ '^fm[0-9a-f]{64}$'
 or not exists(select 1 from app_private.company_frozen_calendar_users f where f.company_id=co and f.request_id=p_request and f.user_id::text=r->>'user_id')
 or not exists(select 1 from jsonb_array_elements(expected) e where e->>'company_id'=co::text and e->>'user_id'=r->>'user_id' and e->>'event_id'=r->>'event_id' and e->>'site_id'=r->>'site_id')) then raise exception 'Calendar receipt scope mismatch';end if;
 select count(distinct (r->>'user_id',r->>'event_id')) into n from jsonb_array_elements(p_records) r;
 if n<>jsonb_array_length(p_records) or n<>jsonb_array_length(expected) then raise exception 'Calendar receipt incomplete';end if;
 delete from public.calendar_auto_events where company_id=co;
 -- Retained provenance may be removed only after the same remote verification.
 delete from app_private.company_calendar_scope_history where company_id=co;
 if public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then raise exception 'Calendar deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.clear_verified_company_calendar_ledger(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.clear_verified_company_calendar_ledger(uuid,uuid,jsonb) to service_role;
commit;
