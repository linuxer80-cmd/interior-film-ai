CREATE OR REPLACE FUNCTION public.resolve_film_alias(p_brand text, p_value text)
 RETURNS TABLE(id uuid, brand text, product_code text, aliases text[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.brand,case when app_private.film_alias_key(p.legacy_non_fire_code)=app_private.film_alias_key(p_value) then p.legacy_non_fire_code else p.product_code end,p.aliases from public.film_products p
 where p.is_active=true and length(app_private.film_alias_key(p_value))>=2 and app_private.stock_brand_key(p.brand)=app_private.stock_brand_key(p_brand)
 and (app_private.film_alias_key(p.legacy_non_fire_code)=app_private.film_alias_key(p_value) or exists(select 1 from unnest(p.aliases) a where app_private.film_alias_key(a)=app_private.film_alias_key(p_value)));
$function$;

CREATE OR REPLACE FUNCTION public.search_film_catalog(p_query text)
 RETURNS TABLE(id uuid, brand text, product_code text, product_name text, sample_image_path text, aliases text[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.brand,case when app_private.film_alias_key(p.legacy_non_fire_code)=app_private.film_alias_key(p_query) then p.legacy_non_fire_code else p.product_code end,p.product_name,p.sample_image_path,p.aliases
 from public.film_products p
 where p.is_active=true and length(btrim(p_query)) between 2 and 60 and length(app_private.film_alias_key(p_query))>=2 and (
  position(upper(case when p_query ~* '^[GF][A-Z][A-Z0-9-]*[0-9]' then substr(p_query,2) else p_query end) in upper(p.product_code))>0
  or position(app_private.film_alias_key(p_query) in app_private.film_alias_key(p.legacy_non_fire_code))>0
  or position(app_private.film_alias_key(p_query) in app_private.film_alias_key(p.product_name))>0
  or exists(select 1 from unnest(p.aliases) a where position(app_private.film_alias_key(p_query) in app_private.film_alias_key(a))>0))
 order by case when upper(p.product_code)=upper(p_query) or app_private.film_alias_key(p.legacy_non_fire_code)=app_private.film_alias_key(p_query) then 0
 when exists(select 1 from unnest(p.aliases) a where app_private.film_alias_key(a)=app_private.film_alias_key(p_query)) then 1 else 2 end,p.product_code,p.id limit 100;
$function$;
