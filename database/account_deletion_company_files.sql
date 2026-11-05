begin;
-- Resolve objects before deleting their owning rows. No Storage metadata is deleted here.
create or replace function public.inspect_company_deletion_files(p_request uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$
declare plan jsonb; co uuid; threads jsonb; files jsonb; conflicts jsonb;
begin
 plan:=public.inspect_company_deletion_scope(p_request);
 co:=(plan->>'company_id')::uuid;
 -- Storage freeze snapshots are authoritative after thread rows are removed.
 -- Refuse conflicting live ownership instead of claiming another company's file.
 if exists(select 1 from public.customer_chat_threads t
   join app_private.company_frozen_chat_threads f on f.thread_id=t.id
   where t.company_id is distinct from f.company_id and (t.company_id=co or f.company_id=co)) then
   raise exception 'Chat ownership snapshot mismatch';
 end if;
 select coalesce(jsonb_agg(id order by id),'[]') into threads from (
   select id from public.customer_chat_threads where company_id=co
   union select thread_id from app_private.company_frozen_chat_threads where company_id=co
 ) owned_threads;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name) order by o.bucket_id,o.name),'[]') into files
 from storage.objects o
 where (o.bucket_id='work-photos' and split_part(o.name,'/',1) in ('sites','history','hierarchy','door-test','estimate-usage','extra-work') and split_part(o.name,'/',2)=co::text)
 or (o.bucket_id in ('company-showcase','site-call-audio-private') and split_part(o.name,'/',1)=co::text)
 or (o.bucket_id='customer-chat' and exists(select 1 from jsonb_array_elements_text(threads) t(id) where t.id=split_part(o.name,'/',1)));
 -- Shared originals remain deletion targets; all dependent references must be cleared first.
 select coalesce(jsonb_agg(f),'[]') into conflicts from jsonb_array_elements(files) f
 where f->>'bucket'='work-photos' and (
 exists(select 1 from public.work_photos t where t.company_id is distinct from co and (t.storage_path=f->>'path' or position('/work-photos/'||(f->>'path') in coalesce(t.photo_url,''))>0))
 or exists(select 1 from public.site_photos t where t.company_id is distinct from co and (t.storage_path=f->>'path' or position('/work-photos/'||(f->>'path') in coalesce(t.photo_url,''))>0))
 or exists(select 1 from public.estimate_photos t where t.company_id is distinct from co and (t.storage_path=f->>'path' or position('/work-photos/'||(f->>'path') in coalesce(t.photo_url,''))>0))
 or exists(select 1 from public.photo_case_management t where t.company_id is distinct from co and (t.storage_path=f->>'path' or position('/work-photos/'||(f->>'path') in coalesce(t.photo_url,''))>0))
 or exists(select 1 from public.site_extra_work t where t.company_id is distinct from co and position(f->>'path' in to_jsonb(t)::text)>0)
 or exists(select 1 from public.customer_leads t where t.company_id is distinct from co and position(f->>'path' in to_jsonb(t)::text)>0)
 or exists(select 1 from public.estimate_usage t where t.company_id is distinct from co and position(f->>'path' in to_jsonb(t)::text)>0));
 -- Legacy customer/leads paths and free-form JSON references need a separate
 -- ownership audit. Never advertise this known-prefix inventory as exhaustive.
 return jsonb_build_object('companyId',co,'chatThreadIds',threads,'files',files,'sharedFiles',conflicts,'sharedFilePolicy','delete_original_and_references','complete',false,'reviewReason','legacy_and_embedded_file_references');
end;$f$;
revoke all on function public.inspect_company_deletion_files(uuid) from public,anon,authenticated;
grant execute on function public.inspect_company_deletion_files(uuid) to service_role;
commit;
