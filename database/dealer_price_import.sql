begin;

create table if not exists public.company_film_selling_prices (
  company_id uuid not null references public.companies(id),
  product_id uuid not null references public.film_products(id),
  price_type text not null check (price_type in ('fire','non_fire')),
  interior_price numeric check (interior_price between 0 and 10000000),
  consumer_price numeric check (consumer_price between 0 and 10000000),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key(company_id,product_id,price_type)
);
comment on table public.company_film_selling_prices is '업체별 판매 기준가. 1m당 VAT 제외 금액. 매입원가와 별도 관리.';
create table if not exists public.dealer_price_import_requests (
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  actor uuid not null,
  dealer_id uuid not null references public.film_dealers(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.company_film_selling_prices enable row level security;
alter table public.dealer_price_import_requests enable row level security;
revoke all on public.company_film_selling_prices, public.dealer_price_import_requests from public, anon, authenticated;
grant select,insert,update on public.company_film_selling_prices, public.dealer_price_import_requests to service_role;

create or replace function public.import_dealer_prices(p_user uuid,p_dealer uuid,p_request uuid,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  co uuid; row_data jsonb; saved public.dealer_price_import_requests%rowtype;
  pid uuid; kind text; supply numeric; interior numeric; consumer numeric; rev integer;
begin
  select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id
  where p.id=p_user and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
  if co is null then raise exception '활성 관리자만 이용할 수 있습니다.' using errcode='42501'; end if;
  if p_request is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception '요청을 확인해주세요.' using errcode='22023'; end if;
  if jsonb_array_length(p_rows) not between 1 and 3000 then raise exception '저장할 제품은 1~3000개입니다.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into saved from public.dealer_price_import_requests where id=p_request;
  if found then
    if saved.company_id<>co or saved.actor<>p_user or saved.dealer_id<>p_dealer or saved.payload is distinct from p_rows then
      raise exception '다른 내용에 사용한 요청 번호입니다.' using errcode='40001';
    end if;
    return jsonb_build_object('saved',jsonb_array_length(p_rows),'replayed',true);
  end if;
  -- Serialize company selling-price updates across different dealers.
  perform 1 from public.companies where id=co for update;
  perform 1 from public.film_dealers where id=p_dealer and company_id=co for update;
  if not found then raise exception '본인 업체의 대리점만 선택해주세요.' using errcode='42501'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'productId',x->>'priceType' having count(*)>1) then
    raise exception '중복 제품이 있습니다.' using errcode='22023';
  end if;
  for row_data in select value from jsonb_array_elements(p_rows) order by value->>'productId',value->>'priceType' loop
    pid:=(row_data->>'productId')::uuid; kind:=row_data->>'priceType';
    supply:=(row_data->>'supply')::numeric; interior:=(row_data->>'interior')::numeric; consumer:=(row_data->>'consumer')::numeric;
    if kind is null or kind not in ('fire','non_fire') or (supply is null and interior is null and consumer is null) then
      raise exception '방염 구분과 가격을 확인해주세요.' using errcode='22023';
    end if;
    if exists(select 1 from unnest(array[supply,interior,consumer]) n where n<0 or n>10000000 or n::text in ('NaN','Infinity','-Infinity')) then
      raise exception '가격 범위를 확인해주세요.' using errcode='22023';
    end if;
    perform 1 from public.film_products where id=pid and is_active=true for share;
    if not found then raise exception '비활성 제품이 있습니다. 미리보기를 다시 확인해주세요.' using errcode='40001'; end if;
    if supply is not null then
      select revision into rev from public.film_dealer_prices where company_id=co and dealer_id=p_dealer and product_id=pid and price_type=kind for update;
      if coalesce(rev,0) is distinct from (row_data->>'supplyRevision')::integer then raise exception '공급가가 변경됐습니다. 미리보기를 다시 확인해주세요.' using errcode='40001'; end if;
      insert into public.film_dealer_prices(company_id,dealer_id,product_id,price_type,unit_price) values(co,p_dealer,pid,kind,supply)
      on conflict(company_id,dealer_id,product_id,price_type) do update set unit_price=excluded.unit_price,revision=film_dealer_prices.revision+1;
    end if;
    if interior is not null or consumer is not null then
      select revision into rev from public.company_film_selling_prices where company_id=co and product_id=pid and price_type=kind for update;
      if coalesce(rev,0) is distinct from (row_data->>'sellingRevision')::integer then raise exception '판매 단가가 변경됐습니다. 미리보기를 다시 확인해주세요.' using errcode='40001'; end if;
      insert into public.company_film_selling_prices(company_id,product_id,price_type,interior_price,consumer_price) values(co,pid,kind,interior,consumer)
      on conflict(company_id,product_id,price_type) do update set
        interior_price=coalesce(excluded.interior_price,company_film_selling_prices.interior_price),
        consumer_price=coalesce(excluded.consumer_price,company_film_selling_prices.consumer_price),
        revision=company_film_selling_prices.revision+1,updated_at=now();
    end if;
  end loop;
  insert into public.dealer_price_import_requests(id,company_id,actor,dealer_id,payload) values(p_request,co,p_user,p_dealer,p_rows);
  return jsonb_build_object('saved',jsonb_array_length(p_rows));
end $$;
revoke all on function public.import_dealer_prices(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_dealer_prices(uuid,uuid,uuid,jsonb) to service_role;

commit;
