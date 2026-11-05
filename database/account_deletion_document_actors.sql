-- Account identifier cleanup only. Document text and media require separate scope checks.
begin;
alter table public.company_inventory_preferences alter column updated_by drop not null;
alter table public.site_completion_estimates alter column updated_by drop not null;
alter table public.standalone_quotes alter column created_by drop not null;
alter table public.photo_case_classifications alter column updated_by drop not null;
alter table public.door_test_uploads alter column confirmed_by drop not null;
create or replace function public.scrub_account_document_actors(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 update public.company_inventory_preferences set updated_by=null where updated_by=u;
 update public.site_completion_estimates set updated_by=null where updated_by=u;
 update public.standalone_quotes set created_by=null where created_by=u;
 update public.photo_case_classifications set updated_by=null where updated_by=u;
 update public.door_test_uploads set confirmed_by=null where confirmed_by=u;
 if exists(select 1 from public.company_inventory_preferences where updated_by=u) or exists(select 1 from public.site_completion_estimates where updated_by=u) or exists(select 1 from public.standalone_quotes where created_by=u) or exists(select 1 from public.photo_case_classifications where updated_by=u) or exists(select 1 from public.door_test_uploads where confirmed_by=u) then raise exception 'Document actor cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_document_actors(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_document_actors(uuid,uuid) to service_role;
commit;
