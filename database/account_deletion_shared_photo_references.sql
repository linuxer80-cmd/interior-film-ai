begin;
create schema if not exists app_private;
create table if not exists app_private.company_deleted_photo_paths(
 path text primary key, company_id uuid not null, request_id uuid not null,
 deleted_at timestamptz not null default now()
);
alter table app_private.company_deleted_photo_paths enable row level security;
revoke all on app_private.company_deleted_photo_paths from public,anon,authenticated,service_role;

create or replace function app_private.guard_deleted_company_photo()
returns trigger language plpgsql security definer set search_path=''
as $f$ begin
 -- Match conservatively for write rejection, never use URL substrings to delete rows.
 if exists(select 1 from app_private.company_deleted_photo_paths p
 where position(p.path in to_jsonb(new)::text)>0) then
 raise exception 'Photo is pending permanent deletion' using errcode='23514';
 end if;
 return new;
end;$f$;
revoke all on function app_private.guard_deleted_company_photo() from public,anon,authenticated;
drop trigger if exists guard_deleted_company_photo on public.work_photos;
create trigger guard_deleted_company_photo before insert or update on public.work_photos for each row execute function app_private.guard_deleted_company_photo();
drop trigger if exists guard_deleted_company_photo on public.estimate_photos;
create trigger guard_deleted_company_photo before insert or update on public.estimate_photos for each row execute function app_private.guard_deleted_company_photo();
drop trigger if exists guard_deleted_company_photo on public.customer_leads;
create trigger guard_deleted_company_photo before insert or update on public.customer_leads for each row execute function app_private.guard_deleted_company_photo();
drop trigger if exists guard_deleted_company_photo on public.estimate_usage;
create trigger guard_deleted_company_photo before insert or update on public.estimate_usage for each row execute function app_private.guard_deleted_company_photo();

-- Only documented arrays of raw Storage paths are rewritten. Unknown JSON
-- structures and URLs remain review blockers rather than losing document data.
create or replace function app_private.remove_deleted_photo_paths(p_value jsonb,p_paths text[])
returns jsonb language plpgsql immutable set search_path=''
as $f$ declare result jsonb;
begin
 if p_value is null or p_value='null'::jsonb then return p_value;end if;
 if jsonb_typeof(p_value)<>'array' then raise exception 'Unsupported photo path structure';end if;
 if exists(select 1 from jsonb_array_elements(p_value) x where jsonb_typeof(x)<>'string') then raise exception 'Unsupported photo path structure';end if;
 select coalesce(jsonb_agg(x order by ord),'[]') into result
 from jsonb_array_elements(p_value) with ordinality as v(x,ord)
 where not (x#>>'{}')=any(p_paths);
 return result;
end;$f$;
revoke all on function app_private.remove_deleted_photo_paths(jsonb,text[]) from public,anon,authenticated;

create or replace function app_private.company_photo_path_authorized(p_company uuid,p_path text)
returns boolean language sql stable set search_path='' as $f$
 select split_part(p_path,'/',1) in('sites','history','hierarchy','door-test','estimate-usage','extra-work')
 and split_part(p_path,'/',2)=p_company::text and split_part(p_path,'/',3)<>'';
$f$;
revoke all on function app_private.company_photo_path_authorized(uuid,text) from public,anon,authenticated,service_role;

-- Narrow cleanup: owned, company-prefixed work photos only. Legacy paths and
-- embedded customer/estimate payloads must not be guessed or partially edited.
create or replace function public.delete_company_shared_photo_references(p_request uuid,p_lease uuid,p_paths text[])
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid; u uuid; ids uuid[];
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account'
 and status in('processing','failed') and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform 1 from public.companies where id=co for update;
 perform public.inspect_company_deletion_scope(p_request);
 if p_paths is null or cardinality(p_paths)=0 or cardinality(p_paths)>1000 or exists(
 select 1 from unnest(p_paths) p where p is null or not app_private.company_photo_path_authorized(co,p) or p ~ '(^|/)(\.|\.\.)(/|$)' or position('%' in p)>0 or position(chr(92) in p)>0
 ) then raise exception 'Company-owned photo paths required';end if;
 lock table public.work_photos,public.estimate_photos,public.customer_leads,public.estimate_usage in share row exclusive mode;
 -- Never erase a customer record or quotation merely because it embeds a photo.
 update public.customer_leads t set
 customer_photo_path=case when customer_photo_path=any(p_paths) then null else customer_photo_path end,
 customer_photo_paths=app_private.remove_deleted_photo_paths(customer_photo_paths,p_paths)
 where exists(select 1 from unnest(p_paths) p where position(p in to_jsonb(t)::text)>0);
 update public.estimate_usage t set
 photo_paths=app_private.remove_deleted_photo_paths(photo_paths,p_paths),
 photo_count=case when jsonb_typeof(photo_paths)='array' then jsonb_array_length(app_private.remove_deleted_photo_paths(photo_paths,p_paths)) else photo_count end
 where exists(select 1 from unnest(p_paths) p where position(p in to_jsonb(t)::text)>0);
 if exists(select 1 from public.customer_leads t cross join unnest(p_paths) p where position(p in to_jsonb(t)::text)>0)
 or exists(select 1 from public.estimate_usage t cross join unnest(p_paths) p where position(p in to_jsonb(t)::text)>0)
 or exists(select 1 from public.work_photos t cross join unnest(p_paths) p where position(p in to_jsonb(t)::text)>0 and t.storage_path is distinct from p)
 or exists(select 1 from public.estimate_photos t cross join unnest(p_paths) p where position(p in to_jsonb(t)::text)>0 and t.storage_path is distinct from p)
 then raise exception 'Embedded photo references require cleanup';end if;
 insert into app_private.company_deleted_photo_paths(path,company_id,request_id)
 select distinct p,co,p_request from unnest(p_paths) p on conflict(path) do nothing;
 if exists(select 1 from app_private.company_deleted_photo_paths where path=any(p_paths) and (company_id<>co or request_id<>p_request)) then raise exception 'Photo deletion ownership mismatch';end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into ids from public.work_photos where storage_path=any(p_paths);
 delete from public.photo_case_classification_history where photo_id=any(ids);
 delete from public.photo_case_classifications where photo_id=any(ids);
 delete from public.work_photos where id=any(ids);
 delete from public.estimate_photos where storage_path=any(p_paths);
 -- Similarity links cascade with their photo rows; parent jobs/estimates remain.
 if exists(select 1 from public.work_photos where storage_path=any(p_paths)) or exists(select 1 from public.estimate_photos where storage_path=any(p_paths)) then raise exception 'Photo references remain';end if;
 if not public.assert_account_deletion_lease(p_request,p_lease,u) then raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.delete_company_shared_photo_references(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.delete_company_shared_photo_references(uuid,uuid,text[]) to service_role;
create or replace function public.verify_company_shared_photo_references(p_request uuid,p_lease uuid,p_paths text[])
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid; u uuid;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests where id=p_request;
 if co is null or u is null or not public.assert_account_deletion_lease(p_request,p_lease,u) then raise exception 'Verified company deletion lease required';end if;
 if p_paths is null or cardinality(p_paths)=0 or cardinality(p_paths)>1000 then return false;end if;
 if exists(select 1 from unnest(p_paths) p where not exists(select 1 from app_private.company_deleted_photo_paths d where d.path=p and d.company_id=co and d.request_id=p_request)) then return false;end if;
 return not(exists(select 1 from public.work_photos t cross join unnest(p_paths) p where position(p in to_jsonb(t)::text)>0)
 or exists(select 1 from public.estimate_photos t cross join unnest(p_paths) p where position(p in to_jsonb(t)::text)>0)
 or exists(select 1 from public.customer_leads t cross join unnest(p_paths) p where position(p in to_jsonb(t)::text)>0)
 or exists(select 1 from public.estimate_usage t cross join unnest(p_paths) p where position(p in to_jsonb(t)::text)>0));
end;$f$;
revoke all on function public.verify_company_shared_photo_references(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.verify_company_shared_photo_references(uuid,uuid,text[]) to service_role;
commit;
