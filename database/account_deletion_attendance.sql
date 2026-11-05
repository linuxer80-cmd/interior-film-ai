begin;
alter table public.attendance_corrections alter column changed_by drop not null;
create or replace function public.scrub_account_attendance(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid; ids uuid[];
begin
 select user_id,worker_ids into u,ids from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 ids:=array(select distinct x from unnest(ids||array(select id from public.workers where user_id=u)) x);
 if exists(select 1 from public.workers where id=any(ids) and user_id is not null and user_id<>u) then raise exception 'Conflicting worker identity'; end if;
 update public.attendance_records set in_gps='{}'::jsonb,out_gps=null,in_distance_m=null,out_distance_m=null where worker_id=any(ids);
 update public.attendance_records set
 reviewed_by=case when reviewed_by=u then null else reviewed_by end,
 corrected_by=case when corrected_by=u then null else corrected_by end
 where reviewed_by=u or corrected_by=u;
 update public.attendance_corrections c set previous_record=previous_record-array['in_gps','out_gps','in_distance_m','out_distance_m']
 where exists(select 1 from public.attendance_records a where a.id=c.attendance_id and a.worker_id=any(ids));
 update public.attendance_corrections set previous_record=previous_record-'reviewed_by' where previous_record->>'reviewed_by'=u::text;
 update public.attendance_corrections set previous_record=previous_record-'corrected_by' where previous_record->>'corrected_by'=u::text;
 update public.attendance_corrections set changed_by=null where changed_by=u;
 delete from public.worker_commute_cache where worker_id=any(ids);
 if exists(select 1 from public.attendance_records where reviewed_by=u or corrected_by=u
 or (worker_id=any(ids) and (in_gps<>'{}'::jsonb or out_gps is not null or in_distance_m is not null or out_distance_m is not null)))
 or exists(select 1 from public.attendance_corrections where changed_by=u or previous_record->>'reviewed_by'=u::text or previous_record->>'corrected_by'=u::text)
 or exists(select 1 from public.worker_commute_cache where worker_id=any(ids)) then raise exception 'Attendance cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_attendance(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_attendance(uuid,uuid) to service_role;
commit;
