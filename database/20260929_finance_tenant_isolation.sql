-- Apply only to the two cost tables; inspect existing policies on sites and
-- workers separately before changing access used by installers.
-- These restrictive policies prevent a broad allow from exposing other tenants.
-- Service-role server requests bypass RLS and must filter by company_id themselves.

create or replace function public.current_finance_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.company_id
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.id = (select auth.uid())
    and p.is_active is distinct from false
    and c.is_active is distinct from false
  limit 1
$$;

revoke all on function public.current_finance_company_id() from public, anon;
grant execute on function public.current_finance_company_id() to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['site_materials', 'site_expenses'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists finance_tenant_boundary on public.%I', table_name);
    execute format(
      'create policy finance_tenant_boundary on public.%I as restrictive for all to authenticated using (company_id = (select public.current_finance_company_id())) with check (company_id = (select public.current_finance_company_id()))',
      table_name
    );
    execute format('drop policy if exists finance_deny_anonymous on public.%I', table_name);
    execute format(
      'create policy finance_deny_anonymous on public.%I as restrictive for all to anon using (false) with check (false)',
      table_name
    );
  end loop;
end $$;
