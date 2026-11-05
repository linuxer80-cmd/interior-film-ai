-- Account-linked identity fields only; report content and cost snapshots are retained.
begin;
create or replace function public.scrub_account_report_actors(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 update public.work_reports set
 created_by=case when created_by=u then null else created_by end,
 reviewed_by=case when reviewed_by=u then null else reviewed_by end
 where created_by=u or reviewed_by=u;
 update public.work_report_history set actor_id=null,actor_name='탈퇴한 사용자' where actor_id=u;
 if exists(select 1 from public.work_reports where created_by=u or reviewed_by=u)
 or exists(select 1 from public.work_report_history where actor_id=u) then
 raise exception 'Report actor cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_report_actors(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_report_actors(uuid,uuid) to service_role;
commit;
