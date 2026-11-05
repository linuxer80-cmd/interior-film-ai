begin;
create table if not exists app_private.company_frozen_calendar_users(company_id uuid not null,user_id uuid not null,request_id uuid not null,primary key(company_id,user_id));
alter table app_private.company_frozen_calendar_users enable row level security;
revoke all on app_private.company_frozen_calendar_users from public,anon,authenticated,service_role;
create or replace function public.calendar_company_sync_allowed(p_user uuid)
returns boolean language sql security definer set search_path=''
as $f$ select p_user is not null and not exists(select 1 from app_private.company_frozen_calendar_users where user_id=p_user);$f$;
revoke all on function public.calendar_company_sync_allowed(uuid) from public,anon,authenticated;
grant execute on function public.calendar_company_sync_allowed(uuid) to service_role;
create or replace function app_private.guard_frozen_calendar_claim()
returns trigger language plpgsql security definer set search_path=''
as $f$ begin
 if new.lease_id is not null and not public.calendar_company_sync_allowed(new.user_id) then raise exception 'Company calendar synchronization is frozen';end if;
 return new;
end;$f$;
revoke all on function app_private.guard_frozen_calendar_claim() from public,anon,authenticated,service_role;
drop trigger if exists guard_frozen_calendar_claim on public.calendar_auto_connections;
create trigger guard_frozen_calendar_claim before insert or update on public.calendar_auto_connections for each row execute function app_private.guard_frozen_calendar_claim();
create or replace function public.calendar_auto_claim(p_user uuid default null)
returns setof public.calendar_auto_connections language sql security invoker set search_path=''
as $f$
 update public.calendar_auto_connections c set lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes'
 where c.user_id=(select x.user_id from public.calendar_auto_connections x
 where x.enabled and not x.needs_reconnect and x.next_run_at<=now()
 and public.calendar_company_sync_allowed(x.user_id)
 and (p_user is null or x.user_id=p_user) and (x.lease_until is null or x.lease_until<now())
 order by x.next_run_at,x.user_id for update skip locked limit 1) returning c.*;
$f$;
revoke all on function public.calendar_auto_claim(uuid) from public,anon,authenticated;
grant execute on function public.calendar_auto_claim(uuid) to service_role;
create or replace function public.freeze_company_calendar_jobs(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$ declare co uuid;plan jsonb;users uuid[];
begin
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 -- Serializes new claims/connection changes with snapshotting and the freeze.
 lock table public.calendar_auto_connections in share row exclusive mode;
 plan:=public.freeze_company_storage_writes(p_request,p_lease);
 co:=(plan->>'companyId')::uuid;
 -- Missing provenance could hide former members: do not guess their company.
 if exists(select 1 from public.calendar_auto_events where company_id is null or site_id is null) then raise exception 'Unattributed calendar history requires review';end if;
 select coalesce(array_agg(distinct id),'{}'::uuid[]) into users from (
 select id from public.profiles where company_id=co
 union select user_id from public.workers where company_id=co and user_id is not null
 union select user_id from public.calendar_auto_events where company_id=co
 union select user_id from app_private.company_frozen_calendar_users where company_id=co
 ) affected;
 -- Even an expired lease may represent a still-running HTTP request. Never
 -- reclaim it here or begin destructive work while it may be executing.
 if exists(select 1 from public.calendar_auto_connections where user_id=any(users) and lease_id is not null) then raise exception 'Calendar execution must stop before company freeze';end if;
 insert into app_private.company_frozen_calendar_users(company_id,user_id,request_id)
 select co,u,p_request from unnest(users) u on conflict(company_id,user_id) do nothing;
 if exists(select 1 from app_private.company_frozen_calendar_users where company_id=co and request_id<>p_request) then raise exception 'Calendar freeze request mismatch';end if;
 return plan||jsonb_build_object('knownCalendarUsersFrozen',true,'calendarUsers',cardinality(users),'complete',false,'remaining','manual_exports_other_external_jobs_and_legacy_file_paths');
end;$f$;
revoke all on function public.freeze_company_calendar_jobs(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freeze_company_calendar_jobs(uuid,uuid) to service_role;
commit;
