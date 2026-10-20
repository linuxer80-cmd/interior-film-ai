begin;
-- Pure normalization. No privileges, tenant scope, product IDs, quantities or prices are changed.
create or replace function public.canonical_film_brand(value text)
returns text language sql immutable security invoker set search_path='' as $$
 select case
 when k.key=any(array['현대보닥','현대','현대C','현대HC','현대LC','현대LNC','현대인테리어필름','현대필름','현대보닷','보닥','HYUNDAI','HYUNDAILC','HYUNDAILNC','HYUNDAIHC','HYUNDAIBODAQ','BODAQ']) then '현대보닥'
 when k.key=any(array['영림','영림필름','영림인테리어필름','YOUNGLIM','YOUNGLIMINTERIORFILM']) then '영림'
 else pg_catalog.btrim(coalesce(value,'')) end
 from (select pg_catalog.upper(pg_catalog.regexp_replace(coalesce(value,''),'[[:space:]&·._-]+','','g')) as key) k;
$$;
revoke all on function public.canonical_film_brand(text) from public,anon;
grant execute on function public.canonical_film_brand(text) to authenticated,service_role;
create or replace function public.normalize_saved_film_brand()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.brand:=public.canonical_film_brand(new.brand);
 return new;
end $$;
revoke all on function public.normalize_saved_film_brand() from public,anon;
grant execute on function public.normalize_saved_film_brand() to authenticated,service_role;

-- Apply to all write paths, including existing RPCs and direct, authorized catalog entry.
drop trigger if exists normalize_saved_film_brand on public.film_products;
create trigger normalize_saved_film_brand before insert or update of brand on public.film_products for each row execute function public.normalize_saved_film_brand();
drop trigger if exists normalize_saved_film_brand on public.site_materials;
create trigger normalize_saved_film_brand before insert or update of brand on public.site_materials for each row execute function public.normalize_saved_film_brand();
drop trigger if exists normalize_saved_film_brand on public.film_stock_rolls;
create trigger normalize_saved_film_brand before insert or update of brand on public.film_stock_rolls for each row execute function public.normalize_saved_film_brand();

-- Preserve catalog IDs and all references. Do not merge ambiguous duplicate catalog rows.
-- Catalog groups that would collide remain unchanged and are reported below.
update public.film_products p set brand=public.canonical_film_brand(p.brand)
where p.brand is distinct from public.canonical_film_brand(p.brand)
 and not exists (select 1 from public.film_products q where q.id<>p.id
  and public.canonical_film_brand(q.brand)=public.canonical_film_brand(p.brand)
  and pg_catalog.upper(pg_catalog.btrim(q.product_code))=pg_catalog.upper(pg_catalog.btrim(p.product_code)));
update public.site_materials set brand=public.canonical_film_brand(brand)
 where brand is distinct from public.canonical_film_brand(brand);
update public.film_stock_rolls set brand=public.canonical_film_brand(brand)
 where brand is distinct from public.canonical_film_brand(brand);
commit;
select '자재·현장·롤 브랜드 표준화 설정 완료' as result;
select public.canonical_film_brand(brand) as brand,pg_catalog.upper(pg_catalog.btrim(product_code)) as product_code,
 count(*) as catalog_rows,array_agg(id order by id) as existing_ids
from public.film_products group by 1,2 having count(*)>1 order by 1,2;
