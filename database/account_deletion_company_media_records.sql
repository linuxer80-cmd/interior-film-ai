begin;
-- Metadata only, after physical file removal. All three phases share one
-- transaction: any unresolved submission restores earlier reference edits.
create or replace function public.delete_frozen_company_media_records(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ begin
 if public.delete_company_site_photo_references(p_request,p_lease) is distinct from true then raise exception 'Site photo cleanup not confirmed';end if;
 if public.delete_company_extra_work_records(p_request,p_lease) is distinct from true then raise exception 'Extra work cleanup not confirmed';end if;
 if public.delete_company_photo_submissions(p_request,p_lease) is distinct from true then raise exception 'Submission cleanup not confirmed';end if;
 return true;
end;$f$;
revoke all on function public.delete_frozen_company_media_records(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_frozen_company_media_records(uuid,uuid) to service_role;
commit;
