begin;
-- Service orchestration must verify remote absence before invoking this RPC.
-- Local empty-ledger checks alone are never proof of remote event deletion.
create or replace function public.release_company_calendar_jobs(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid;subject uuid;users uuid[];
begin
 select company_deletion_id,coalesce(user_id,subject_id) into co,subject
 from public.account_deletion_requests where id=p_request and identity_verified=true
 and scope='personal_account' and status in('processing','failed')
 and company_record_deleted_at is not null and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or subject is null then raise exception 'Finalized company deletion lease required';end if;
 lock table public.calendar_auto_connections,public.calendar_auto_events,app_private.company_frozen_calendar_users in share row exclusive mode;
 if not exists(select 1 from public.account_deletion_blocks where user_id=subject)
 or exists(select 1 from public.calendar_auto_connections where user_id=subject) then raise exception 'Deleting account calendar access remains';end if;
 if exists(select 1 from public.companies where id=co)
 or exists(select 1 from public.profiles where company_id=co)
 or exists(select 1 from public.workers where company_id=co)
 or exists(select 1 from public.calendar_auto_events where company_id=co)
 then raise exception 'Company calendar scope remains';end if;
 if not exists(select 1 from app_private.company_write_freezes where company_id=co and request_id=p_request)
 or exists(select 1 from app_private.company_frozen_calendar_users where company_id=co and request_id<>p_request)
 then raise exception 'Company freeze request mismatch';end if;
 select coalesce(array_agg(user_id),'{}'::uuid[]) into users from app_private.company_frozen_calendar_users where company_id=co;
 if exists(select 1 from public.calendar_auto_events where user_id=any(users) and (company_id is null or site_id is null)) then raise exception 'Unattributed calendar history remains';end if;
 if exists(select 1 from public.calendar_auto_connections where user_id=any(users) and lease_id is not null) then raise exception 'Calendar execution remains active';end if;
 delete from app_private.company_frozen_calendar_users where company_id=co and request_id=p_request;
 -- Do not re-enable revoked connections, reconnect-needed users, the deleting
 -- account, or users still paused by another company's deletion.
 update public.calendar_auto_connections c set next_run_at=clock_timestamp()
 where c.user_id=any(users) and c.user_id<>subject and c.enabled and not c.needs_reconnect
 and not exists(select 1 from public.account_deletion_blocks b where b.user_id=c.user_id)
 and not exists(select 1 from app_private.company_frozen_calendar_users f where f.user_id=c.user_id);
 if not exists(select 1 from public.account_deletion_requests where id=p_request and lease_token=p_lease and lease_until>clock_timestamp()) then raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.release_company_calendar_jobs(uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_company_calendar_jobs(uuid,uuid) to service_role;
commit;
