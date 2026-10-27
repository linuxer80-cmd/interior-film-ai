CREATE OR REPLACE FUNCTION public.consultation_match_key(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select lower(
    regexp_replace(
      coalesce(p_value, ''),
      '[^가-힣a-zA-Z0-9]',
      '',
      'g'
    )
  );
$function$;
