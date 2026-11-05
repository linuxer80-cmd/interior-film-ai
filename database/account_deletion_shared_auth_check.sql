create or replace function public.account_deletion_shared_auth_check(p_user uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select exists(select 1 from ministry.members where user_id=p_user)
 or exists(select 1 from ministry.leader_enrollments where user_id=p_user);
$fn$;
revoke all on function public.account_deletion_shared_auth_check(uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_shared_auth_check(uuid) to service_role;
