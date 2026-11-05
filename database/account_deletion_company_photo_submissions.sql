begin;
-- Resolve deterministic upload paths even for interrupted pending submissions.
create or replace function public.delete_company_photo_submissions(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid;u uuid;r record;paths text[];ids uuid[];p text;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account' and status in('processing','failed')
 and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 if not exists(select 1 from app_private.company_write_freezes where company_id=co and request_id=p_request) then raise exception 'Company write freeze required';end if;
 perform public.inspect_company_deletion_scope(p_request);
 lock table public.sites,public.site_photos,public.customer_photo_submissions in share row exclusive mode;
 if exists(select 1 from public.customer_photo_submissions b left join public.sites s on s.id=b.site_id
 where (b.company_id=co or s.company_id=co) and b.company_id is distinct from s.company_id) then raise exception 'Cross-company photo submission';end if;
 for r in select * from public.customer_photo_submissions where company_id=co loop
  if r.photo_count is null or r.photo_count not between 1 and 10 or r.status not in('pending','completed') or r.photo_ids is null then raise exception 'Unknown photo submission structure';end if;
  if coalesce(r.note,'') ~ '[/\\:%]' then raise exception 'Unresolved submission text reference';end if;
  select array_agg(path order by i),array_agg(substr(encode(sha256(convert_to(path,'UTF8')),'hex'),1,32)::uuid order by i) into paths,ids
  from (select i,'sites/'||co::text||'/'||r.site_id::text||'/request/customer-'||r.id::text||'-'||i::text||'.jpg' path from generate_series(0,r.photo_count-1) i) q;
  if (r.status='completed' and r.photo_ids is distinct from ids) or (r.status='pending' and cardinality(r.photo_ids)<>0) then raise exception 'Photo submission provenance mismatch';end if;
  if exists(select 1 from storage.objects where bucket_id='work-photos' and name=any(paths)) then raise exception 'Submission photo files remain';end if;
  if exists(select 1 from public.site_photos where storage_path=any(paths) or id=any(ids)) then raise exception 'Submission photo references remain';end if;
  foreach p in array paths loop
   insert into app_private.company_deleted_photo_paths(path,company_id,request_id) values(p,co,p_request) on conflict(path) do nothing;
   if not exists(select 1 from app_private.company_deleted_photo_paths where path=p and company_id=co and request_id=p_request) then raise exception 'Photo deletion scope mismatch';end if;
  end loop;
 end loop;
 delete from public.customer_photo_submissions where company_id=co;
 if exists(select 1 from public.customer_photo_submissions where company_id=co) then raise exception 'Photo submissions remain';end if;
 if public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.delete_company_photo_submissions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_company_photo_submissions(uuid,uuid) to service_role;
commit;
