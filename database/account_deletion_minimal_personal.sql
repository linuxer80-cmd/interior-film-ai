begin;
-- First general automatic scope: no business/actor records, no administrator
-- role, and only recognized personal avatars. Unknown data is a review blocker.
create or replace function public.inspect_minimal_personal_deletion(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare u uuid;refs jsonb;unsupported boolean;file_count bigint;finalized_company uuid;codes text[]:='{}';
begin
 select coalesce(user_id,subject_id) into u from public.account_deletion_requests where id=p_request;
 if u is null or public.assert_account_deletion_lease(p_request,p_lease,u) is distinct from true then raise exception 'Verified deletion lease required';end if;
 select company_deletion_id into finalized_company from public.account_deletion_requests where id=p_request and company_record_deleted_at is not null
 and not exists(select 1 from public.companies where id=company_deletion_id);
 if public.account_deletion_shared_auth_check(u) then codes:=array_append(codes,'shared_auth');end if;
 if exists(select 1 from public.profiles where id=u and ((role is distinct from 'worker' and not(role='owner' and company_id is null and finalized_company is not null))
 or to_jsonb(profiles)::text ~ '(https?://|storage/v1|work-photos|customer/|leads/)')) then codes:=array_append(codes,'profile_scope_requires_review');end if;
 refs:=public.inspect_account_deletion_references(u);
 if jsonb_typeof(refs) is distinct from 'array' then raise exception 'Reference inventory unavailable';end if;
 if exists(select 1 from jsonb_array_elements(refs) r where not ((r->>'schema'='public'
 and r->>'table' in('profiles','account_deletion_requests','account_deletion_blocks'))
 or (finalized_company is not null and r->>'schema'='app_private' and r->>'table'='company_frozen_calendar_users'
 and not exists(select 1 from app_private.company_frozen_calendar_users f where f.user_id=u and (f.company_id<>finalized_company or f.request_id<>p_request))))) then codes:=array_append(codes,'linked_records_require_review');end if;
 select count(*),coalesce(bool_or(not(o.bucket_id='labor-avatars' and split_part(o.name,'/',1)=u::text
 and o.name ~ ('^'||u::text||'/[0-9a-fA-F-]{36}\.(jpg|png|webp)$'))),false)
 into file_count,unsupported from storage.objects o where position(u::text in to_jsonb(o)::text)>0;
 if unsupported then codes:=array_append(codes,'unsupported_files_require_review');end if;
 return jsonb_build_object('subjectId',u,'eligible',cardinality(codes)=0,'codes',codes,
 'filesRemaining',file_count,'profileRemaining',exists(select 1 from public.profiles where id=u));
end;$f$;
revoke all on function public.inspect_minimal_personal_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inspect_minimal_personal_deletion(uuid,uuid) to service_role;
commit;
