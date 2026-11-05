begin;
-- Preserve thread ownership even after the thread row is deleted: a previously
-- issued signed upload URL must not recreate an orphaned chat attachment.
create table if not exists app_private.company_frozen_chat_threads(thread_id uuid primary key,company_id uuid not null);
alter table app_private.company_frozen_chat_threads enable row level security;
revoke all on app_private.company_frozen_chat_threads from public,anon,authenticated,service_role;
create or replace function app_private.company_storage_path_owner(p_bucket text,p_path text)
returns uuid language plpgsql security definer set search_path=''
as $f$ declare candidate text;co uuid;t uuid;
begin
 if p_bucket='work-photos' and split_part(p_path,'/',1) in('sites','history','hierarchy','door-test','estimate-usage','extra-work') then candidate:=split_part(p_path,'/',2);
 elsif p_bucket in('company-showcase','site-call-audio-private') then candidate:=split_part(p_path,'/',1);
 elsif p_bucket='customer-chat' then
  candidate:=split_part(p_path,'/',1);
  if candidate !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
  t:=candidate::uuid;
  select company_id into co from app_private.company_frozen_chat_threads where thread_id=t;
  if co is not null then return co;end if;
  select company_id into co from public.customer_chat_threads where id=t for share;
  return co;
 end if;
 if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return candidate::uuid;end if;
 return null;
end;$f$;
revoke all on function app_private.company_storage_path_owner(text,text) from public,anon,authenticated,service_role;
create or replace function app_private.guard_frozen_company_upload()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare candidates uuid[];co uuid;
begin
 candidates:=array[app_private.company_storage_path_owner(new.bucket_id,new.name)];
 if tg_op='UPDATE' then candidates:=array_append(candidates,app_private.company_storage_path_owner(old.bucket_id,old.name));end if;
 for co in select distinct x from unnest(candidates) x where x is not null order by x loop
  perform 1 from public.companies where id=co for share;
  if exists(select 1 from app_private.company_write_freezes where company_id=co) then
   raise exception 'Company uploads are frozen for deletion' using errcode='42501';end if;
 end loop;
 return new;
end;$f$;
revoke all on function app_private.guard_frozen_company_upload() from public,anon,authenticated,service_role;
drop trigger if exists guard_frozen_company_upload on storage.objects;
create trigger guard_frozen_company_upload before insert or update on storage.objects for each row execute function app_private.guard_frozen_company_upload();
create or replace function public.freeze_company_storage_writes(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$ declare co uuid;plan jsonb;
begin
 plan:=public.freeze_company_direct_writes(p_request,p_lease);
 co:=(plan->>'companyId')::uuid;
 -- Direct freeze holds the thread table lock until this transaction commits.
 insert into app_private.company_frozen_chat_threads(thread_id,company_id)
 select id,company_id from public.customer_chat_threads where company_id=co on conflict(thread_id) do nothing;
 if exists(select 1 from public.customer_chat_threads t join app_private.company_frozen_chat_threads f on f.thread_id=t.id where t.company_id=co and f.company_id<>co) then raise exception 'Chat ownership snapshot mismatch';end if;
 return plan||jsonb_build_object('knownStorageUploadsFrozen',true,'complete',false,'remaining','legacy_paths_external_jobs_and_storage_deletion_authorization');
end;$f$;
revoke all on function public.freeze_company_storage_writes(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freeze_company_storage_writes(uuid,uuid) to service_role;
commit;
