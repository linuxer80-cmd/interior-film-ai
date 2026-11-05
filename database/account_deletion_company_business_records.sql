begin;
-- One transaction for the implemented business-record stages. This is NOT
-- full company deletion: files, sites, remaining company data and Auth still
-- require separate verified cleanup before completion can be recorded.
create or replace function public.delete_company_business_records(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$
declare co uuid; u uuid;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account'
 and status in('processing','failed') and lease_token=p_lease
 and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform 1 from public.companies where id=co for update;
 perform public.inspect_company_deletion_scope(p_request);
 -- Every component takes this lock first; holding it until this transaction
 -- ends also prevents their individual entry points interleaving these stages.
 lock table public.sites in share row exclusive mode;
 if public.delete_company_site_links(p_request,p_lease) is distinct from true then
  raise exception 'Site-link cleanup not confirmed';end if;
 if public.delete_company_work_records(p_request,p_lease) is distinct from true then
  raise exception 'Work record cleanup not confirmed';end if;
 if public.delete_company_receivables(p_request,p_lease) is distinct from true then
  raise exception 'Receivable cleanup not confirmed';end if;
 if public.delete_company_materials(p_request,p_lease) is distinct from true then
  raise exception 'Material cleanup not confirmed';end if;
 if public.delete_company_assignments(p_request,p_lease) is distinct from true then
  raise exception 'Assignment cleanup not confirmed';end if;
 if public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then
  raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.delete_company_business_records(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_company_business_records(uuid,uuid) to service_role;
commit;
