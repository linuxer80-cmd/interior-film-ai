alter table public.film_products add column if not exists aliases text[] not null default '{}';

-- Older records used Hyundai spellings that differ only by Unicode/punctuation.
do $brand$
declare definition text;
begin
 select pg_get_functiondef('app_private.stock_brand_key(text)'::regprocedure) into definition;
 if position('public.canonical_film_brand' in definition)=0 then
  definition:=replace(definition,$old$coalesce(value, '')$old$,$new$public.canonical_film_brand(normalize(coalesce(value, ''),NFKC))$new$);
  execute definition;
 end if;
end $brand$;

create or replace function app_private.film_alias_key(v text) returns text
language sql immutable set search_path='' as $$
 select regexp_replace(lower(coalesce(v,'')), '[[:space:]·＆&_-]+', '', 'g');
$$;

create or replace function app_private.validate_film_aliases() returns trigger
language plpgsql set search_path='' as $$
declare alias text; k text;
begin
 if cardinality(new.aliases)>20 then raise exception '별칭은 최대 20개입니다.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(724906031);
 for alias in select unnest(new.aliases) loop
  k:=app_private.film_alias_key(alias);
  if alias is null or length(k)<2 or length(alias)>60 or k ~ '^[a-z]+[0-9]+[a-z0-9-]*$' then
   raise exception '별칭은 2~60자의 제품명으로 입력해주세요. 제품번호는 별칭으로 등록하지 않습니다.' using errcode='22023';
  end if;
  if exists(select 1 from public.film_products p where p.id<>new.id
    and app_private.stock_brand_key(p.brand)=app_private.stock_brand_key(new.brand)
    and (app_private.film_alias_key(p.product_code)=k or exists(select 1 from unnest(p.aliases) a where app_private.film_alias_key(a)=k))) then
   raise exception '같은 브랜드의 다른 제품에 이미 등록된 별칭입니다.' using errcode='23505';
  end if;
 end loop;
 return new;
end $$;
drop trigger if exists validate_film_aliases on public.film_products;
create trigger validate_film_aliases before insert or update of aliases,brand,product_code on public.film_products for each row execute function app_private.validate_film_aliases();

create or replace function public.resolve_film_alias(p_brand text,p_value text)
returns table(id uuid,brand text,product_code text,aliases text[]) language sql stable set search_path='' as $$
 select p.id,p.brand,p.product_code,p.aliases from public.film_products p
 where p.is_active=true and app_private.stock_brand_key(p.brand)=app_private.stock_brand_key(p_brand)
 and exists(select 1 from unnest(p.aliases) a where app_private.film_alias_key(a)=app_private.film_alias_key(p_value));
$$;
revoke all on function public.resolve_film_alias(text,text) from public,anon,authenticated;
grant execute on function public.resolve_film_alias(text,text) to service_role;

create or replace function public.search_film_catalog(p_query text)
returns table(id uuid,brand text,product_code text,product_name text,sample_image_path text,aliases text[])
language sql stable set search_path='' as $$
 select p.id,p.brand,p.product_code,p.product_name,p.sample_image_path,p.aliases
 from public.film_products p
 where p.is_active=true and length(btrim(p_query)) between 2 and 60 and length(app_private.film_alias_key(p_query))>=2 and (
  position(upper(case when p_query ~* '^[GF][A-Z][A-Z0-9-]*[0-9]' then substr(p_query,2) else p_query end) in upper(p.product_code))>0
  or position(app_private.film_alias_key(p_query) in app_private.film_alias_key(p.product_name))>0
  or exists(select 1 from unnest(p.aliases) a where position(app_private.film_alias_key(p_query) in app_private.film_alias_key(a))>0))
 order by case when upper(p.product_code)=upper(p_query) then 0
 when exists(select 1 from unnest(p.aliases) a where app_private.film_alias_key(a)=app_private.film_alias_key(p_query)) then 1 else 2 end,p.product_code,p.id limit 100;
$$;
revoke all on function public.search_film_catalog(text) from public,anon,authenticated;
grant execute on function public.search_film_catalog(text) to service_role;

-- Confirmed by the owner: same colour. Do not infer aliases from OCR mistakes.
update public.film_products set aliases=array(select distinct a from unnest(aliases || array['메탈로즈골드','보닥 메탈로즈골드','메탈 로즈골드']) a)
where product_code='VM906' and app_private.stock_brand_key(brand)=app_private.stock_brand_key('현대보닥');

-- Preserve existing brand and fire-variant checks; resolve only exact approved aliases.
do $patch$
declare definition text;
begin
 select pg_get_functiondef('app_private.roll_matches_material(uuid,text,text)'::regprocedure) into definition;
 if position('-- approved_product_alias_v1' in definition)=0 then
  definition:=replace(definition,'  roll_code :=',
  E'  -- approved_product_alias_v1
  select coalesce((select min(p.product_code) from public.film_products p
   where p.is_active=true and app_private.stock_brand_key(p.brand)=app_private.stock_brand_key(p_brand)
   and exists(select 1 from unnest(p.aliases) a where app_private.film_alias_key(a)=app_private.film_alias_key(requested))
   having count(*)=1),requested) into requested;

  roll_code :=');
  execute definition;
 end if;
 select pg_get_functiondef('public.film_stock(uuid,uuid,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'r.id,m.brand,m.product_code,m.price_type',$replacement$r.id,m.brand,coalesce(nullif(btrim(m.product_code),''),m.product_name),m.price_type$replacement$);
 definition:=replace(definition,'stock.id,material.brand,material.product_code,material.price_type',$replacement$stock.id,material.brand,coalesce(nullif(btrim(material.product_code),''),material.product_name),material.price_type$replacement$);
 execute definition;
end $patch$;
