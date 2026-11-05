begin;
drop trigger if exists guard_deleted_company_photo on public.site_extra_work;
create trigger guard_deleted_company_photo before insert or update on public.site_extra_work
for each row execute function app_private.guard_deleted_company_photo();
-- Metadata phase only: original objects must already be absent. Preserve foreign
-- business records while removing exact references to this company's originals.
create or replace function public.delete_company_extra_work_records(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid;u uuid;paths text[];p text;r record;clean jsonb;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account' and status in('processing','failed')
 and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 if not exists(select 1 from app_private.company_write_freezes where company_id=co and request_id=p_request) then raise exception 'Company write freeze required';end if;
 perform public.inspect_company_deletion_scope(p_request);
 lock table public.sites,public.site_extra_work in share row exclusive mode;
 -- Free-text links can be the only remaining evidence of an original.
 -- Conservatively refuse path/URL syntax instead of discarding that evidence.
 if exists(select 1 from public.site_extra_work e where company_id=co and (coalesce(to_jsonb(e)->>'description','')||coalesce(to_jsonb(e)->>'review_note','')) ~ '[/\\:%]') then raise exception 'Unresolved extra work text reference';end if;
 if exists(select 1 from public.site_extra_work where company_id=co and (photo_paths is null or jsonb_typeof(photo_paths)<>'array')) then raise exception 'Unsupported extra work photo structure';end if;
 if exists(select 1 from public.site_extra_work e cross join lateral jsonb_array_elements(e.photo_paths) v where e.company_id=co and jsonb_typeof(v)<>'string') then raise exception 'Unsupported extra work photo structure';end if;
 select coalesce(array_agg(distinct v#>>'{}'),'{}'::text[]) into paths from public.site_extra_work e cross join lateral jsonb_array_elements(e.photo_paths) v where e.company_id=co;
 foreach p in array paths loop
  if split_part(p,'/',1) not in('sites','history','hierarchy','door-test','estimate-usage','extra-work')
   or split_part(p,'/',2)<>co::text or cardinality(string_to_array(p,'/'))<3
   or p ~ '[%\\[:cntrl:]]' or exists(select 1 from unnest(string_to_array(p,'/')) part where part in('','.', '..'))
  then raise exception 'Unresolved extra work photo ownership';end if;
 end loop;
 if exists(select 1 from storage.objects where bucket_id='work-photos' and name=any(paths)) then raise exception 'Extra work photo files remain';end if;
 for r in select e.*,to_jsonb(e) body from public.site_extra_work e
 where e.company_id=co or exists(select 1 from unnest(paths) as refs(photo_path) where position(refs.photo_path in to_jsonb(e)::text)>0) loop
  if not exists(select 1 from public.sites where id=r.site_id and company_id=r.company_id) then raise exception 'Cross-company extra work site reference';end if;
  clean:=app_private.remove_deleted_photo_paths(r.photo_paths,paths);
  if exists(select 1 from unnest(paths) as refs(photo_path) where position(refs.photo_path in jsonb_set(r.body,'{photo_paths}',coalesce(clean,'null'::jsonb))::text)>0) then raise exception 'Embedded extra work photo reference requires review';end if;
 end loop;
 foreach p in array paths loop
  insert into app_private.company_deleted_photo_paths(path,company_id,request_id) values(p,co,p_request) on conflict(path) do nothing;
  if not exists(select 1 from app_private.company_deleted_photo_paths where path=p and company_id=co and request_id=p_request) then raise exception 'Photo deletion scope mismatch';end if;
 end loop;
 update public.site_extra_work e set photo_paths=app_private.remove_deleted_photo_paths(e.photo_paths,paths)
 where e.company_id<>co and exists(select 1 from unnest(paths) as refs(photo_path) where position(refs.photo_path in to_jsonb(e)::text)>0);
 delete from public.site_extra_work where company_id=co;
 if exists(select 1 from public.site_extra_work e where e.company_id=co or exists(select 1 from unnest(paths) as refs(photo_path) where position(refs.photo_path in to_jsonb(e)::text)>0)) then raise exception 'Extra work references remain';end if;
 if public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.delete_company_extra_work_records(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_company_extra_work_records(uuid,uuid) to service_role;
commit;
