begin;
-- Explicit, lease-bound entry point; the private authorization does not survive
-- the RPC transaction. Never expose a standalone authorization RPC.
create or replace function public.delete_frozen_company_business_records(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid;
begin
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 select company_deletion_id into co from public.account_deletion_requests where id=p_request;
 if not exists(select 1 from app_private.company_write_freezes where company_id=co and request_id=p_request) then raise exception 'Company write freeze required';end if;
 if public.delete_company_business_records(p_request,p_lease) is distinct from true then raise exception 'Company business deletion not confirmed';end if;
 if public.delete_company_trade_records(p_request,p_lease) is distinct from true then raise exception 'Company trade deletion not confirmed';end if;
 if public.delete_company_quote_records(p_request,p_lease) is distinct from true then raise exception 'Company quote deletion not confirmed';end if;
 return true;
end;$f$;
revoke all on function public.delete_frozen_company_business_records(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_frozen_company_business_records(uuid,uuid) to service_role;
create or replace function public.finalize_frozen_empty_company(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid;
begin
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 select company_deletion_id into co from public.account_deletion_requests where id=p_request;
 if not exists(select 1 from app_private.company_write_freezes where company_id=co and request_id=p_request) then raise exception 'Company write freeze required';end if;
 if public.delete_empty_company_record(p_request,p_lease) is distinct from true then raise exception 'Empty company finalization not confirmed';end if;
 return true;
end;$f$;
revoke all on function public.finalize_frozen_empty_company(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finalize_frozen_empty_company(uuid,uuid) to service_role;
commit;
