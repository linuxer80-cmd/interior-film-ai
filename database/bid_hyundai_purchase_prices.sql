-- 비아이디 현대 매입단가 보정 / 원·m / 부가세 별도
-- 임시테이블 없이 단일 SQL 문장으로 실행합니다.
with target as materialized (
  select id as dealer_id,company_id
  from public.film_dealers
  where company_id='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid
    and regexp_replace(upper(name),'[^A-Z0-9가-힣]','','g') ~ '(비아이디|BID)'
),
rules(prefixes,price_type,unit_price) as (
  values
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
  (array['RF'], 'non_fire', 23500)
),
products as (
  select id,
    regexp_replace(upper(product_code),'\s','','g') as code,
    regexp_replace(upper(coalesce(legacy_non_fire_code,'')),'\s','','g') as alias
  from public.film_products
  where is_active=true
    and regexp_replace(upper(brand),'[^A-Z0-9가-힣]','','g') in
      ('현대','현대LNC','현대LC','현대보닥','현대인테리어필름',
       'HYUNDAI','HYUNDAILNC','HYUNDAILC','HYUNDAIBODAQ','BODAQ','보닥')
),
bases as (
  select *,case when code ~ '^[GF][A-Z]+[0-9]'
    then substring(code from 2) else code end as base_code
  from products
),
candidates as (
  select distinct p.id as product_id,r.price_type,r.unit_price
  from bases p cross join rules r
  cross join lateral unnest(r.prefixes) as prefix(value)
  where exists (
    select 1 from unnest(array[
      p.base_code,
      (case when r.price_type='fire' then 'F' else 'G' end)||p.base_code,
      case when r.price_type='non_fire' then p.alias else '' end
    ]) as variant(code)
    where variant.code=prefix.value
       or variant.code ~ ('^'||prefix.value||'[0-9]')
  )
),
conflicts as (
  select product_id,price_type from candidates
  group by product_id,price_type having count(distinct unit_price)>1
),
checks as (
  select (select count(*) from target) as dealer_count,
    (select count(*) from conflicts) as conflict_count,
    (select count(*) from candidates) as matched_count
),
changes as materialized (
  select t.company_id,t.dealer_id,c.product_id,c.price_type,c.unit_price,
    old.unit_price as old_price,old.product_id is null as is_new
  from candidates c cross join target t cross join checks k
  left join public.film_dealer_prices old
    on old.company_id=t.company_id and old.dealer_id=t.dealer_id
    and old.product_id=c.product_id and old.price_type=c.price_type
  where k.dealer_count=1 and k.conflict_count=0
    and old.unit_price is distinct from c.unit_price
),
saved as (
  insert into public.film_dealer_prices as existing
    (company_id,dealer_id,product_id,price_type,unit_price)
  select company_id,dealer_id,product_id,price_type,unit_price
  from changes order by product_id,price_type
  on conflict(company_id,dealer_id,product_id,price_type)
  do update set unit_price=excluded.unit_price,
    revision=existing.revision+1
  returning product_id,price_type
)
select
  case
    when k.dealer_count<>1 then '변경 안 함: 비아이디 대리점이 없거나 중복됨'
    when k.conflict_count>0 then '변경 안 함: 제품별 단가 중복 매칭'
    when k.matched_count=0 then '변경 안 함: 일치하는 현대 제품 없음'
    else '단가 비교·보정 완료'
  end as result,
  k.dealer_count,k.matched_count,k.conflict_count,
  (select count(*) from changes where is_new) as added,
  (select count(*) from changes where not is_new) as corrected,
  (select count(*) from saved) as saved,
  coalesce((select jsonb_agg(jsonb_build_object(
    'product_id',c.product_id,'price_type',c.price_type,
    'old_price',c.old_price,'new_price',c.unit_price
  ) order by c.product_id,c.price_type) from changes c),'[]'::jsonb) as changes
from checks k;
