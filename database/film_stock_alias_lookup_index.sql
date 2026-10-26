-- Preserve alias normalization and ambiguity handling while avoiding full catalog scans per roll.
create or replace function app_private.film_alias_keys(values_ text[]) returns text[]
language sql immutable set search_path='' as $$
 select coalesce(array_agg(app_private.film_alias_key(a)),array[]::text[]) from unnest(values_) a;
$$;
revoke all on function app_private.film_alias_keys(text[]) from public,anon,authenticated;
grant execute on function app_private.film_alias_keys(text[]) to service_role;
create index if not exists film_products_active_alias_keys_idx
 on public.film_products using gin (app_private.film_alias_keys(aliases)) where is_active=true;
do $patch$
declare definition text;old_expression text := 'exists(select 1 from unnest(p.aliases) a where app_private.film_alias_key(a)=app_private.film_alias_key(requested))';new_expression text := 'app_private.film_alias_keys(p.aliases) @> array[app_private.film_alias_key(requested)]';
begin
 select pg_get_functiondef('app_private.roll_matches_material(uuid,text,text)'::regprocedure) into definition;
 if position(old_expression in definition)>0 then
  execute replace(definition,old_expression,new_expression);
 elsif position(new_expression in definition)=0 then
  raise exception 'Unexpected roll alias lookup definition';
 end if;
end;$patch$;
analyze public.film_products;
