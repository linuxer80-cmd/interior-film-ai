-- Keep archived planned materials out of both report checks and change snapshots.
-- Patch only the active-row predicates; preserve the deployed authorization,
-- locking, quantity validation, return history and function grants.
do $patch$
declare
  target record;
  definition text;
  matches integer;
  patched integer;
begin
  for target in
    select * from (values
      ('public.site_operations(uuid,uuid,text,jsonb)',
       'm[.]material_type[[:space:]]*=[[:space:]]*''planned''',
       'm.material_type = ''planned'' and m.removed_at is null', 2),
      ('public.site_operations(uuid,uuid,text,jsonb)',
       'and[[:space:]]+material_type[[:space:]]*=[[:space:]]*''planned''',
       'and material_type = ''planned'' and removed_at is null', 1),
      ('public.save_report_material_flow(uuid,uuid,jsonb)',
       'and[[:space:]]+material_type[[:space:]]*=[[:space:]]*''planned''',
       'and material_type = ''planned'' and removed_at is null', 1),
      ('public.save_site_material_outgoing(uuid,uuid,jsonb)',
       'and[[:space:]]+material_type[[:space:]]*=[[:space:]]*''planned''',
       'and material_type = ''planned'' and removed_at is null', 1)
    ) as patches(signature, pattern, replacement, expected_count)
  loop
    select pg_get_functiondef(target.signature::regprocedure) into definition;
    select count(*) into matches from regexp_matches(definition, target.pattern, 'g');
    patched := (length(definition) - length(replace(definition, target.replacement, '')))
      / length(target.replacement);
    if matches <> target.expected_count or patched not in (0, target.expected_count) then
      raise exception 'Active-material patch no longer matches function %', target.signature;
    end if;
    if patched = 0 then
      execute regexp_replace(definition, target.pattern, target.replacement, 'g');
    end if;
  end loop;
end $patch$;
