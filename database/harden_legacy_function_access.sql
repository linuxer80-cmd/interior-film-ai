-- Run after verifying that public cannot be modified by client roles and that
-- pgvector is installed in public. These functions remain SECURITY INVOKER.
-- Revoke direct calls to the trigger function without disabling its trigger.
begin;

do $$
begin
  if has_schema_privilege('public', 'public', 'CREATE')
     or has_schema_privilege('anon', 'public', 'CREATE')
     or has_schema_privilege('authenticated', 'public', 'CREATE') then
    raise exception 'public schema is writable by an untrusted role';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'vector' and n.nspname = 'public'
  ) then
    raise exception 'pgvector must be installed in public before this change';
  end if;
end;
$$;

alter function public.get_average_work_cost(text)
  set search_path = pg_catalog, public, pg_temp;
alter function public.calculate_estimate(text, numeric, integer)
  set search_path = pg_catalog, public, pg_temp;
alter function public.match_work_photos(public.vector, double precision, integer)
  set search_path = pg_catalog, public, pg_temp;

revoke all on function public.record_material_price_change()
  from public, anon, authenticated;

commit;
