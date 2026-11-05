begin;
create or replace function public.revoke_account_deletion_sessions(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests
 where id=p_request and lease_token=p_lease and lease_until>now()
 and identity_verified=true and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u)
 then raise exception 'Access block required'; end if;
 if public.account_deletion_shared_auth_check(u) then raise exception 'Shared account requires review'; end if;
 delete from auth.sessions where user_id=u;
 delete from auth.refresh_tokens where user_id=u::text;
 if exists(select 1 from auth.sessions where user_id=u)
 or exists(select 1 from auth.refresh_tokens where user_id=u::text)
 then raise exception 'Session cleanup not verified'; end if;
 return true;
end;
$f$;
revoke all on function public.revoke_account_deletion_sessions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_account_deletion_sessions(uuid,uuid) to service_role;
commit;
