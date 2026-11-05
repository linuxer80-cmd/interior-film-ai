begin;
create or replace function public.verify_account_deletion_core(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$ declare u uuid; ids uuid[]; result jsonb;
begin
 select coalesce(user_id,subject_id) into u from public.account_deletion_requests
 where id=p_request and lease_token=p_lease and lease_until>now() and identity_verified=true for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 select worker_ids into ids from public.account_deletion_requests where id=p_request;
 select jsonb_build_object(
 'sessions_clear',not exists(select 1 from auth.sessions where user_id=u),
 'refresh_tokens_clear',not exists(select 1 from auth.refresh_tokens where user_id=u::text),
 'push_clear',not exists(select 1 from public.push_subscriptions where user_id=u),
 'labor_profile_clear',not exists(select 1 from public.labor_profiles where user_id=u),
 'labor_private_clear',not exists(select 1 from public.labor_personal_details where user_id=u),
 'directory_consent_clear',not exists(select 1 from public.worker_directory_consent where user_id=u),
 'worker_private_clear',not exists(select 1 from public.worker_private_details d join public.workers w on w.id=d.worker_id where (w.user_id=u or w.id=any(ids))),
 'worker_details_clear',not exists(select 1 from public.workers where (user_id=u or id=any(ids)) and
 (name is distinct from '탈퇴한 시공자' or phone is not null or memo is not null or position is not null or specialties is not null or is_active=true)),
 'scope','core_only') into result;
 return result;
end;
$f$;
revoke all on function public.verify_account_deletion_core(uuid,uuid) from public,anon,authenticated;
grant execute on function public.verify_account_deletion_core(uuid,uuid) to service_role;
commit;
