begin;
-- Durable provenance survives normal synchronization forgetting a ledger row.
-- No cascading FKs: removed members/sites must remain discoverable for deletion.
create table if not exists app_private.company_calendar_scope_history(
 company_id uuid not null,user_id uuid not null,site_id uuid not null,
 first_seen_at timestamptz not null default now(),
 primary key(company_id,user_id,site_id)
);
alter table app_private.company_calendar_scope_history add column if not exists event_ids text[] not null default '{}';
alter table app_private.company_calendar_scope_history enable row level security;
revoke all on app_private.company_calendar_scope_history from public,anon,authenticated,service_role;
-- This company-keyed table must participate in the freeze coverage contract.
drop trigger if exists aaa_company_write_freeze on app_private.company_calendar_scope_history;
create trigger aaa_company_write_freeze before insert or update or delete on app_private.company_calendar_scope_history for each row execute function app_private.guard_company_write_freeze();
drop trigger if exists zzz_company_write_freeze on app_private.company_calendar_scope_history;
create trigger zzz_company_write_freeze after insert or update or delete on app_private.company_calendar_scope_history for each row execute function app_private.guard_company_write_freeze();
create or replace function app_private.remember_calendar_deletion_scope()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
 if tg_op<>'INSERT' and old.company_id is not null and old.user_id is not null and old.site_id is not null then
 insert into app_private.company_calendar_scope_history(company_id,user_id,site_id,event_ids) values(old.company_id,old.user_id,old.site_id,array[old.event_id])
 on conflict(company_id,user_id,site_id) do update set event_ids=array(select distinct x from unnest(app_private.company_calendar_scope_history.event_ids||excluded.event_ids) x where x is not null order by x);
 end if;
 if tg_op<>'DELETE' and new.company_id is not null and new.user_id is not null and new.site_id is not null then
 insert into app_private.company_calendar_scope_history(company_id,user_id,site_id,event_ids) values(new.company_id,new.user_id,new.site_id,array[new.event_id])
 on conflict(company_id,user_id,site_id) do update set event_ids=array(select distinct x from unnest(app_private.company_calendar_scope_history.event_ids||excluded.event_ids) x where x is not null order by x);
 end if;
 return null;
end;$f$;
revoke all on function app_private.remember_calendar_deletion_scope() from public,anon,authenticated,service_role;
drop trigger if exists remember_calendar_deletion_scope on public.calendar_auto_events;
create trigger remember_calendar_deletion_scope after insert or update or delete on public.calendar_auto_events for each row execute function app_private.remember_calendar_deletion_scope();
insert into app_private.company_calendar_scope_history(company_id,user_id,site_id,event_ids)
select company_id,user_id,site_id,array_agg(distinct event_id) from public.calendar_auto_events where company_id is not null and user_id is not null and site_id is not null group by company_id,user_id,site_id
on conflict(company_id,user_id,site_id) do update set event_ids=array(select distinct x from unnest(app_private.company_calendar_scope_history.event_ids||excluded.event_ids) x where x is not null order by x);
-- Extend the existing freeze to include former members retained in provenance.
do $patch$ declare original text; changed text;
begin
 original:=pg_get_functiondef('public.freeze_company_calendar_jobs(uuid,uuid)'::regprocedure);
 if position('company_calendar_scope_history' in original)=0 then
 changed:=replace(original,'union select user_id from app_private.company_frozen_calendar_users where company_id=co',
 'union select user_id from app_private.company_frozen_calendar_users where company_id=co
 union select user_id from app_private.company_calendar_scope_history where company_id=co');
 if changed=original then raise exception 'Calendar freeze patch target missing';end if;
 execute changed;
 end if;
end;$patch$;
create or replace function public.inspect_frozen_company_calendar_scope(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare co uuid; sites jsonb;users jsonb;
begin
 if public.assert_company_deletion_frozen(p_request,p_lease) is distinct from true then raise exception 'Frozen calendar scope required';end if;
 select company_deletion_id into co from public.account_deletion_requests where id=p_request;
 select coalesce(jsonb_agg(id order by id),'[]') into sites from (
 select id from public.sites where company_id=co
 union select site_id from public.calendar_auto_events where company_id=co and site_id is not null
 union select site_id from app_private.company_calendar_scope_history where company_id=co) s;
 select coalesce(jsonb_agg(user_id order by user_id),'[]') into users from app_private.company_frozen_calendar_users f where f.company_id=co and f.request_id=p_request
 and (exists(select 1 from public.calendar_auto_connections c where c.user_id=f.user_id)
 or exists(select 1 from app_private.company_calendar_scope_history h where h.company_id=co and h.user_id=f.user_id)
 or exists(select 1 from public.calendar_auto_events e where e.company_id=co and e.user_id=f.user_id));
 if exists(select 1 from app_private.company_calendar_scope_history h where h.company_id=co and not exists(select 1 from app_private.company_frozen_calendar_users f where f.company_id=co and f.request_id=p_request and f.user_id=h.user_id)) then raise exception 'Historical calendar member not frozen';end if;
 return jsonb_build_object('companyId',co,'siteIds',sites,'userIds',users,'sitesComplete',false,'usersComplete',false,'policy','verified_app_events_only','knownScopeVerified',true,'reviewReason','unattributable_external_events_preserved');
end;$f$;
revoke all on function public.inspect_frozen_company_calendar_scope(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inspect_frozen_company_calendar_scope(uuid,uuid) to service_role;
create or replace function public.inspect_company_calendar_deletion_ledger(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare co uuid; result jsonb;
begin
 if public.assert_company_deletion_frozen(p_request,p_lease) is distinct from true then raise exception 'Frozen calendar scope required';end if;
 select company_deletion_id into co from public.account_deletion_requests where id=p_request;
 -- Approved policy preserves external events with unavailable identities; do not
 -- invent IDs or treat the historical inventory as complete.
 select coalesce(jsonb_agg(to_jsonb(e) order by user_id,event_id),'[]') into result from (
 select company_id,user_id,site_id,event_id from public.calendar_auto_events where company_id=co
 union select company_id,user_id,site_id,unnest(event_ids) from app_private.company_calendar_scope_history where company_id=co) e;
 if jsonb_array_length(result)>10000 then raise exception 'Calendar ledger exceeds deletion limit';end if;
 return result;
end;$f$;
revoke all on function public.inspect_company_calendar_deletion_ledger(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inspect_company_calendar_deletion_ledger(uuid,uuid) to service_role;
commit;
