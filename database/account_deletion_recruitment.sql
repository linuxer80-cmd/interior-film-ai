begin;
create or replace function public.scrub_account_recruitment(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests
 where id=p_request and lease_token=p_lease and lease_until>now()
 and identity_verified=true and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 update public.labor_applications set status='withdrawn',share_phone=false,updated_at=now()
 where user_id=u and status in ('invited','applied');
 update public.labor_applications set share_phone=false where user_id=u;
 update public.worker_connection_requests set status='cancelled',updated_at=now()
 where target_user_id=u and status='pending';
 delete from public.labor_personal_details where user_id=u;
 delete from public.worker_directory_consent where user_id=u;
 delete from public.labor_profiles where user_id=u;
 if exists(select 1 from public.labor_profiles where user_id=u)
 or exists(select 1 from public.labor_personal_details where user_id=u)
 or exists(select 1 from public.worker_directory_consent where user_id=u)
 then raise exception 'Recruitment cleanup not verified'; end if;
 return true;
end;
$f$;
revoke all on function public.scrub_account_recruitment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_recruitment(uuid,uuid) to service_role;
commit;
