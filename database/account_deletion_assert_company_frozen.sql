begin;
create or replace function public.assert_company_deletion_frozen(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $f$
declare co uuid;u uuid;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests where id=p_request;
 if co is null or u is null or public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then raise exception 'Company deletion lease required';end if;
 if not exists(select 1 from app_private.company_write_freezes where company_id=co and request_id=p_request)
 or not exists(select 1 from app_private.company_frozen_calendar_users where company_id=co and request_id=p_request and user_id=u) then raise exception 'Company deletion freeze required';end if;
 return true;
end;$f$;
revoke all on function public.assert_company_deletion_frozen(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assert_company_deletion_frozen(uuid,uuid) to service_role;
commit;
