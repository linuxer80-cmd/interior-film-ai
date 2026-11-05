begin;
create or replace function public.assert_account_deletion_lease(p_request uuid,p_lease uuid,p_subject uuid)
returns boolean language sql security definer set search_path=''
as $f$
 select exists(select 1 from public.account_deletion_requests
 where id=p_request and lease_token=p_lease
 and coalesce(user_id,subject_id)=p_subject
 and identity_verified=true and scope='personal_account'
 and status in ('processing','failed') and lease_until>clock_timestamp());
$f$;
revoke all on function public.assert_account_deletion_lease(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assert_account_deletion_lease(uuid,uuid,uuid) to service_role;
commit;
