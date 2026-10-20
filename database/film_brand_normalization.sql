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

-- Treat spelling aliases as the same brand while preserving every existing issued-material guard.
create or replace function app_private.guard_issued_material()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if old.material_type='planned' and exists(select 1 from public.site_material_issues where material_id=old.id) then
  if tg_op='DELETE' then raise exception '반출 이력이 있는 자재는 삭제할 수 없습니다.'; end if;
  if (public.canonical_film_brand(new.brand),new.product_code,new.product_name,new.unit,new.film_product_id) is distinct from
     (public.canonical_film_brand(old.brand),old.product_code,old.product_name,old.unit,old.film_product_id) then
   raise exception '반출 이력이 있는 제품은 바꿀 수 없습니다. 새 자재를 추가해주세요.';
  end if;
  if new.unit_price is distinct from old.unit_price and exists(select 1 from public.work_reports where site_id=old.site_id and review_status in ('pending','approved')) then
   raise exception '제출된 보고서의 자재 단가는 변경할 수 없습니다. 보고서를 반려한 뒤 수정해주세요.';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $function$;

-- Allow a spelling-only brand update; every other actual-cost write keeps the original settlement guard.
create or replace function app_private.guard_settled_actual()
returns trigger language plpgsql security definer set search_path='' as $function$
declare sid uuid; typ text;
begin
 if tg_op='UPDATE' then
  if old.material_type='actual' and new.material_type='actual'
   and public.canonical_film_brand(new.brand) is not distinct from public.canonical_film_brand(old.brand)
   and (pg_catalog.to_jsonb(new)-'brand'-'updated_at') is not distinct from
       (pg_catalog.to_jsonb(old)-'brand'-'updated_at') then
   return new;
  end if;
 end if;
 if tg_op='DELETE' then sid:=old.site_id; typ:=old.material_type;
 else sid:=new.site_id; typ:=new.material_type; end if;
 if typ='actual' and exists(select 1 from public.site_material_issues where site_id=sid and voided_at is null)
    and current_setting('app.material_settlement',true) is distinct from 'on' then
  raise exception '반출·반입 관리 현장은 완료보고에서 자재비가 자동 계산됩니다. 반입량 수정 후 보고서를 다시 제출해주세요.';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $function$;

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
