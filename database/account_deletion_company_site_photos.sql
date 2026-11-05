begin;
drop trigger if exists guard_deleted_company_photo on public.site_photos;
create trigger guard_deleted_company_photo before insert or update on public.site_photos
for each row execute function app_private.guard_deleted_company_photo();
create or replace function public.delete_company_site_photo_references(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid;u uuid;paths text[];p text;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account' and status in('processing','failed')
 and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 if not exists(select 1 from app_private.company_write_freezes where company_id=co and request_id=p_request) then raise exception 'Company write freeze required';end if;
 perform public.inspect_company_deletion_scope(p_request);
 lock table public.sites,public.site_photos in share row exclusive mode;
 select coalesce(array_agg(distinct storage_path),'{}'::text[]) into paths from public.site_photos where company_id=co;
 foreach p in array paths loop
  if p is null or split_part(p,'/',1) not in('sites','history','hierarchy','door-test','estimate-usage','extra-work')
   or split_part(p,'/',2)<>co::text or cardinality(string_to_array(p,'/'))<3
   or p ~ '[%\\[:cntrl:]]' or exists(select 1 from unnest(string_to_array(p,'/')) part where part in('','.', '..'))
  then raise exception 'Unresolved site photo ownership';end if;
 end loop;
 if exists(select 1 from storage.objects where bucket_id='work-photos' and name=any(paths)) then raise exception 'Site photo files remain';end if;
 -- Delete exact original-path references only. Unknown URL/embedded aliases
 -- stop the operation instead of being silently dropped.
 if exists(select 1 from public.site_photos ph where ph.storage_path=any(paths)
 and nullif(ph.photo_url,'') is not null
 and (ph.photo_url !~ '^https://[^/]+[.]supabase[.]co/storage/v1/object/(public|sign)/work-photos/'
 or split_part(regexp_replace(ph.photo_url,'^https://[^/]+[.]supabase[.]co/storage/v1/object/(public|sign)/work-photos/',''),'?',1)<>ph.storage_path)) then
 raise exception 'Unresolved site photo URL';end if;
 if exists(select 1 from public.site_photos ph cross join unnest(paths) path
 where position(path in to_jsonb(ph)::text)>0 and ph.storage_path is distinct from path) then raise exception 'Embedded site photo reference requires review';end if;
 if exists(select 1 from public.site_photos ph join public.sites s on s.id=ph.site_id
 where ph.storage_path=any(paths) and ph.company_id is distinct from s.company_id) then raise exception 'Cross-company site reference requires review';end if;
 foreach p in array paths loop
  insert into app_private.company_deleted_photo_paths(path,company_id,request_id) values(p,co,p_request) on conflict(path) do nothing;
  if not exists(select 1 from app_private.company_deleted_photo_paths where path=p and company_id=co and request_id=p_request) then raise exception 'Photo deletion scope mismatch';end if;
 end loop;
 delete from public.site_photos where storage_path=any(paths);
 if exists(select 1 from public.site_photos where company_id=co or storage_path=any(paths)) then raise exception 'Site photo references remain';end if;
 if public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.delete_company_site_photo_references(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_company_site_photo_references(uuid,uuid) to service_role;
commit;
