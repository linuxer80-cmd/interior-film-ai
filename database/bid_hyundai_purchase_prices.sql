-- 기분좋은공간 / 비아이디 공급 매입단가 / 2026-05-11 시행 / 원·m / 부가세 별도
-- 필름장이 업체의 비아이디 현재 매입단가만 보정합니다.
-- 판매가, 현장 원가, 기존 롤·입고·사용 기록은 변경하지 않습니다.
begin;

create temporary table bid_price_target on commit drop as
select d.id as dealer_id, d.company_id, d.name
from public.film_dealers d
where d.company_id = '2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid
  and regexp_replace(upper(d.name), '[^A-Z0-9가-힣]', '', 'g') ~ '(비아이디|BID)';

do $$
begin
  if (select count(*) from bid_price_target) <> 1 then
    raise exception '필름장이의 비아이디 대리점이 없거나 중복됩니다. 대리점명을 확인해주세요.';
  end if;
  perform 1 from public.companies c
    join bid_price_target t on t.company_id=c.id for update of c;
  perform 1 from public.film_dealers d
    join bid_price_target t on t.dealer_id=d.id for update of d;
end $$;

create temporary table bid_price_sheet (
  prefixes text[], price_type text, unit_price numeric
) on commit drop;
insert into bid_price_sheet values
  (array['W','S','LS','LM','PTW','BLC'], 'fire', 9000),
  (array['ZSW'], 'fire', 10000),
  (array['PNT','ZX','Z','BZ','DW','PZ','HZ','XP'], 'fire', 11500),
  (array['SMT'], 'fire', 12000),
  (array['NS','RM','HD','HS','CP','PNC','SL','SF'], 'fire', 12500),
  (array['VM'], 'fire', 13500),
  (array['SPW'], 'fire', 13000),
  (array['PM'], 'fire', 14000),
  (array['APZ','LW'], 'fire', 16000),
  (array['NF'], 'fire', 29500),
  (array['GW','GS','GLS','GLM','GPTW','GBLC'], 'non_fire', 5800),
  (array['GZSW'], 'non_fire', 7300),
  (array['GZX'], 'non_fire', 8400),
  (array['SMT','GPNT','GHD','GHS','GCP'], 'non_fire', 8800),
  (array['GRM','GNS','GPNC','GSL','GSF'], 'non_fire', 9700),
  (array['GVM'], 'non_fire', 10700),
  (array['GPM','GSPW'], 'non_fire', 11000),
  (array['GAPZ','GLW','GOGW'], 'non_fire', 13000),
  (array['UMI','EXF','ECF'], 'non_fire', 18000),
  (array['RF'], 'non_fire', 23500);

create temporary table bid_price_matches on commit drop as
with products as (
  select p.id, p.product_code,
    regexp_replace(upper(p.product_code), '\s', '', 'g') as code,
    regexp_replace(upper(coalesce(p.legacy_non_fire_code,'')), '\s', '', 'g') as alias
  from public.film_products p
  where p.is_active = true
    and regexp_replace(upper(p.brand), '[^A-Z0-9가-힣]', '', 'g') in
      ('현대','현대LNC','현대LC','현대보닥','현대인테리어필름',
       'HYUNDAI','HYUNDAILNC','HYUNDAILC','HYUNDAIBODAQ','BODAQ','보닥')
), bases as (
  select *, case when code ~ '^[GF][A-Z]+[0-9]'
    then substring(code from 2) else code end as base_code
  from products
)
select distinct p.id as product_id, p.product_code, r.price_type, r.unit_price
from bases p
cross join bid_price_sheet r
cross join lateral unnest(r.prefixes) as prefix(value)
where exists (
  select 1
  from unnest(array[
    p.base_code,
    (case when r.price_type='fire' then 'F' else 'G' end)||p.base_code,
    case when r.price_type='non_fire' then p.alias else '' end
  ]) as variant(code)
  where variant.code = prefix.value
     or variant.code ~ ('^'||prefix.value||'[0-9]')
);

do $$
begin
  if not exists(select 1 from bid_price_matches) then
    raise exception '단가표와 일치하는 현대 제품이 없습니다. 제품 카탈로그를 확인해주세요.';
  end if;
  if exists(select 1 from bid_price_matches
    group by product_id,price_type having count(distinct unit_price)>1) then
    raise exception '서로 다른 단가가 중복 매칭되었습니다. 변경을 중단했습니다.';
  end if;
end $$;

create temporary table bid_price_changes on commit drop as
select t.company_id,t.dealer_id,t.name as dealer_name,
  m.product_id,m.product_code,m.price_type,
  old.unit_price as old_price,m.unit_price as new_price,
  case when old.product_id is null then '누락 추가' else '단가 수정' end as action
from bid_price_matches m
cross join bid_price_target t
left join public.film_dealer_prices old
  on old.company_id=t.company_id and old.dealer_id=t.dealer_id
  and old.product_id=m.product_id and old.price_type=m.price_type
where old.unit_price is distinct from m.unit_price;

insert into public.film_dealer_prices as existing
  (company_id,dealer_id,product_id,price_type,unit_price)
select company_id,dealer_id,product_id,price_type,new_price
from bid_price_changes
on conflict (company_id,dealer_id,product_id,price_type)
do update set unit_price=excluded.unit_price,
  revision=existing.revision+1;

-- 비교·수정 내역
select dealer_name,product_code,price_type,old_price,new_price,action
from bid_price_changes order by product_code,price_type;

-- 결과 요약: 재실행 시 추가·수정은 0건이어야 정상입니다.
select count(*) filter(where action='누락 추가') as added,
       count(*) filter(where action='단가 수정') as corrected,
       (select count(*) from bid_price_matches) as matched
from bid_price_changes;

-- 표에 해당 구분이 없어 그대로 둔 기존 현대 매입단가
select p.product_code,d.price_type,d.unit_price as unchanged_price
from public.film_dealer_prices d
join bid_price_target t on t.company_id=d.company_id and t.dealer_id=d.dealer_id
join public.film_products p on p.id=d.product_id
where regexp_replace(upper(p.brand),'[^A-Z0-9가-힣]','','g') in
  ('현대','현대LNC','현대LC','현대보닥','현대인테리어필름',
   'HYUNDAI','HYUNDAILNC','HYUNDAILC','HYUNDAIBODAQ','BODAQ','보닥')
  and not exists(select 1 from bid_price_matches m
    where m.product_id=d.product_id and m.price_type=d.price_type)
order by p.product_code,d.price_type;

-- 표와 불일치하는 단가가 남아 있는지 재확인합니다.
select count(*) as remaining_mismatches
from bid_price_matches m cross join bid_price_target t
left join public.film_dealer_prices p
  on p.company_id=t.company_id and p.dealer_id=t.dealer_id
  and p.product_id=m.product_id and p.price_type=m.price_type
where p.unit_price is distinct from m.unit_price;
commit;
