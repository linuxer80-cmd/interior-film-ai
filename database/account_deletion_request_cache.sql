begin;
create or replace function public.scrub_account_request_cache(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request and lease_token=p_lease and lease_until>now() and identity_verified=true and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 perform 1 from public.site_screenshot_requests where user_id=u for update;
 if exists(select 1 from public.site_screenshot_requests where user_id=u and status='pending') then raise exception 'Screenshot analysis still pending'; end if;
 delete from public.site_screenshot_requests where user_id=u;
 delete from public.consultation_registration_requests where user_id=u;
 return true;
end;$f$;
revoke all on function public.scrub_account_request_cache(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_request_cache(uuid,uuid) to service_role;
commit;
