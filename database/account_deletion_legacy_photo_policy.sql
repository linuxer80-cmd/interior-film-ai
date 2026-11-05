begin;
create table if not exists app_private.approved_shared_photo_deletions(
 bucket_id text not null check(bucket_id='work-photos'),
 path text not null,
 object_id uuid not null,
 company_ids uuid[] not null check(cardinality(company_ids)=2 and company_ids[1]<>company_ids[2]),
 policy text not null check(policy='delete_original_and_all_references_on_either_company_deletion'),
 approved_at timestamptz not null default now(),
 approval_note text not null,
 primary key(bucket_id,path)
);
alter table app_private.approved_shared_photo_deletions enable row level security;
revoke all on app_private.approved_shared_photo_deletions from public,anon,authenticated,service_role;
-- An exact object ID prevents an old approval from silently authorizing a new
-- upload that happens to reuse the same path. This does not certify other files.
create or replace function public.inspect_approved_shared_photo_deletions(p_request uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$ declare co uuid; plan jsonb; result jsonb;
begin
 plan:=public.inspect_company_deletion_scope(p_request);
 co:=(plan->>'company_id')::uuid;
 if exists(select 1 from app_private.approved_shared_photo_deletions a join storage.objects o on o.bucket_id=a.bucket_id and o.name=a.path where co=any(a.company_ids) and o.id<>a.object_id) then raise exception 'Approved photo object replaced';end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',a.bucket_id,'path',a.path,'objectId',a.object_id,'present',o.id is not null) order by a.path),'[]') into result
 from app_private.approved_shared_photo_deletions a left join storage.objects o on o.bucket_id=a.bucket_id and o.name=a.path where co=any(a.company_ids);
 return jsonb_build_object('companyId',co,'files',result,'policy','delete_original_and_all_references_on_either_company_deletion','complete',false);
end;$f$;
revoke all on function public.inspect_approved_shared_photo_deletions(uuid) from public,anon,authenticated;
grant execute on function public.inspect_approved_shared_photo_deletions(uuid) to service_role;
-- Extend the existing reference-cleanup authorization only for reviewed objects.
create or replace function app_private.company_photo_path_authorized(p_company uuid,p_path text)
returns boolean language sql stable security definer set search_path='' as $f$
 select (split_part(p_path,'/',1) in('sites','history','hierarchy','door-test','estimate-usage','extra-work')
 and split_part(p_path,'/',2)=p_company::text and split_part(p_path,'/',3)<>'')
 or exists(select 1 from app_private.approved_shared_photo_deletions a
 where a.bucket_id='work-photos' and a.path=p_path and p_company=any(a.company_ids)
 and exists(select 1 from app_private.company_write_freezes f where f.company_id=p_company)
 and not exists(select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.path and o.id<>a.object_id));
$f$;
revoke all on function app_private.company_photo_path_authorized(uuid,text) from public,anon,authenticated,service_role;
create or replace function app_private.guard_approved_shared_photo_upload()
returns trigger language plpgsql security definer set search_path='' as $f$
declare co uuid;
begin
 for co in select distinct unnest(a.company_ids) from app_private.approved_shared_photo_deletions a
 where (a.bucket_id=new.bucket_id and a.path=new.name)
 or (tg_op='UPDATE' and a.bucket_id=old.bucket_id and a.path=old.name) order by 1 loop
 perform 1 from public.companies where id=co for share;
 end loop;
 if exists(select 1 from app_private.approved_shared_photo_deletions a
 join app_private.company_write_freezes f on f.company_id=any(a.company_ids)
 where (a.bucket_id=new.bucket_id and a.path=new.name)
 or (tg_op='UPDATE' and a.bucket_id=old.bucket_id and a.path=old.name)) then
 raise exception 'Approved shared photo is frozen for deletion' using errcode='42501';
 end if;
 return new;
end;$f$;
revoke all on function app_private.guard_approved_shared_photo_upload() from public,anon,authenticated,service_role;
drop trigger if exists guard_approved_shared_photo_upload on storage.objects;
create trigger guard_approved_shared_photo_upload before insert or update on storage.objects for each row execute function app_private.guard_approved_shared_photo_upload();
create or replace function public.delete_approved_shared_photo_references(p_request uuid,p_lease uuid,p_paths text[])
returns boolean language plpgsql security definer set search_path='' as $f$
declare co uuid;
begin
 perform app_private.authorize_company_cleanup(p_request,p_lease);
 select company_deletion_id into co from public.account_deletion_requests where id=p_request;
 if p_paths is null or cardinality(p_paths)=0 or exists(select 1 from unnest(p_paths) p where not exists(
 select 1 from app_private.approved_shared_photo_deletions a where a.path=p and a.bucket_id='work-photos' and co=any(a.company_ids))) then raise exception 'Approved shared paths required';end if;
 return public.delete_company_shared_photo_references(p_request,p_lease,p_paths);
end;$f$;
revoke all on function public.delete_approved_shared_photo_references(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.delete_approved_shared_photo_references(uuid,uuid,text[]) to service_role;
commit;
