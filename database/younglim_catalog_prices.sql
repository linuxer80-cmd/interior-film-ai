-- 영림 제공 단가표: 원/m, VAT 별도. 5/18 인상 표기, 연도 미상.
-- 기존 양수 단가는 보존하며 NULL/0만 채웁니다. 실제 업체 매입 기록은 변경하지 않습니다.
begin;
create table if not exists public.film_catalog_prices (
  product_id uuid not null references public.film_products(id) on delete cascade,
  price_type text not null check (price_type in ('fire','non_fire')),
  installer_price numeric check (installer_price >= 0),
  interior_price numeric check (interior_price >= 0),
  vat_included boolean not null default false,
  source text,
  primary key (product_id, price_type)
);
alter table public.film_catalog_prices enable row level security;
revoke all on public.film_catalog_prices from public, anon, authenticated;
grant select on public.film_catalog_prices to service_role;
create temporary table younglim_price_sheet (
  prefix text primary key, price_type text, installer_price numeric, interior_price numeric
) on commit drop;
insert into younglim_price_sheet values
  ('PW', 'non_fire', 6500, 10000),
  ('PS', 'non_fire', 6500, 10000),
  ('PX', 'non_fire', 6500, 10000),
  ('IS', 'non_fire', 6500, 10000),
  ('Y12', 'non_fire', 6500, 10000),
  ('Y102', 'non_fire', 6500, 10000),
  ('PHC', 'non_fire', 7500, 11000),
  ('PWR', 'non_fire', 9000, 12000),
  ('PSM', 'non_fire', 9000, 12000),
  ('Y05', 'non_fire', 9000, 12000),
  ('Y49', 'non_fire', 9000, 12000),
  ('PMS', 'non_fire', 9500, 13000),
  ('PME', 'non_fire', 9500, 13000),
  ('PWS', 'non_fire', 9500, 13000),
  ('PHA', 'non_fire', 11000, 14000),
  ('PWT', 'non_fire', 11500, 15000),
  ('PMT', 'non_fire', 11500, 15000),
  ('PG', 'non_fire', 13000, 16500),
  ('PT', 'non_fire', 14000, 17000),
  ('PWE', 'non_fire', 14500, 18000),
  ('PUL', 'non_fire', 23000, 28000),
  ('FPW', 'fire', 10500, 14000),
  ('FPS', 'fire', 10500, 14000),
  ('FPX', 'fire', 10500, 14000),
  ('FPSM', 'fire', 13000, 17000),
  ('FPMS', 'fire', 13500, 17000),
  ('FPME', 'fire', 13500, 17000),
  ('FPWR', 'fire', 13500, 17000),
  ('FPWS', 'fire', 13500, 17000),
  ('FPHA', 'fire', 15000, 19000),
  ('FPWT', 'fire', 15500, 19000),
  ('FPMT', 'fire', 15500, 19000),
  ('FPWE', 'fire', 18000, 22000),
  ('FPT', 'fire', 22000, 27000);
create temporary table younglim_matched_prices on commit drop as
select p.id as product_id, r.price_type, r.installer_price, r.interior_price
from public.film_products p
cross join lateral (
  select regexp_replace(upper(p.product_code), '\s', '', 'g') as code
) c
join younglim_price_sheet r on
  (case when r.price_type='fire' then
    case when c.code like 'F%' then c.code else 'F'||c.code end
   else case when c.code like 'F%' then substring(c.code from 2) else c.code end end)
  ~ ('^'||r.prefix||case when r.prefix ~ '[0-9]$' then '$' else '[0-9]' end)
where regexp_replace(upper(p.brand), '[^A-Z0-9가-힣]', '', 'g')
  in ('영림','영림인테리어필름','YOUNGLIM');
insert into public.film_catalog_prices as existing
  (product_id, price_type, installer_price, interior_price, vat_included, source)
select product_id, price_type, installer_price, interior_price, false,
  '영림 제공 단가표 / 5월18일 인상 표기(연도 미상) / VAT 별도'
from younglim_matched_prices
on conflict (product_id, price_type) do update set
  installer_price = case when coalesce(existing.installer_price,0)=0 then excluded.installer_price else existing.installer_price end,
  interior_price = case when coalesce(existing.interior_price,0)=0 then excluded.interior_price else existing.interior_price end
where existing.vat_included = false;
-- 카탈로그의 기존 시공자 단가도 비어 있는 값만 보충합니다.
update public.film_products p set
  non_fire_price_per_meter = case when coalesce(p.non_fire_price_per_meter,0)=0 then r.installer_price else p.non_fire_price_per_meter end
from younglim_matched_prices r
where p.id=r.product_id and r.price_type='non_fire' and p.price_vat_included is false
  and coalesce(p.non_fire_price_per_meter,0)=0;
update public.film_products p set
  fire_price_per_meter = case when coalesce(p.fire_price_per_meter,0)=0 then r.installer_price else p.fire_price_per_meter end
from younglim_matched_prices r
where p.id=r.product_id and r.price_type='fire' and p.price_vat_included is false
  and coalesce(p.fire_price_per_meter,0)=0;
-- 적용된 전체 제품 / 가격 확인
select p.product_code, p.product_name, c.price_type,
       c.installer_price as 시공자단가, c.interior_price as 업자단가
from public.film_catalog_prices c
join public.film_products p on p.id=c.product_id
join younglim_matched_prices m on m.product_id=c.product_id and m.price_type=c.price_type
order by p.product_code,c.price_type;
-- 표와 매칭되지 않아 그대로 둔 영림 제품
select p.product_code as 미매칭코드, p.product_name
from public.film_products p
where regexp_replace(upper(p.brand), '[^A-Z0-9가-힣]', '', 'g') in ('영림','영림인테리어필름','YOUNGLIM')
  and not exists (select 1 from younglim_matched_prices m where m.product_id=p.id);
commit;
