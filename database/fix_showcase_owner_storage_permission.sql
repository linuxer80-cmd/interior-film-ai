create or replace function app_private.can_manage_company_showcase(target_company uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
 select 1 from public.profiles p join public.companies c on c.id=p.company_id
 where p.id=auth.uid() and p.company_id=target_company and p.role='owner'
 and p.is_active=true and c.is_active=true
 );
$$;
revoke all on function app_private.can_manage_company_showcase(uuid) from public,anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.can_manage_company_showcase(uuid) to authenticated;
alter policy company_showcase_upload on storage.objects with check (
 bucket_id='company-showcase'
 and (storage.foldername(name))[1]=(select public.current_company_id())::text
 and app_private.can_manage_company_showcase((select public.current_company_id()))
);
alter policy company_showcase_read on storage.objects using (
 bucket_id='company-showcase'
 and (storage.foldername(name))[1]=(select public.current_company_id())::text
 and app_private.can_manage_company_showcase((select public.current_company_id()))
);
alter policy company_public_cases_owner on public.company_public_cases using (app_private.can_manage_company_showcase(company_id)) with check (app_private.can_manage_company_showcase(company_id));
alter policy company_public_profiles_owner on public.company_public_profiles using (app_private.can_manage_company_showcase(company_id)) with check (app_private.can_manage_company_showcase(company_id));
