CREATE OR REPLACE FUNCTION public.register_dealer_film(p_user uuid, p_body jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  co uuid;
  rid uuid;
  pid uuid;
  result jsonb;
  item public.film_products%rowtype;
  previous public.film_product_registration_requests%rowtype;

  brand_name text := btrim(coalesce(p_body->>'brand',''));
  code text := upper(btrim(coalesce(p_body->>'productCode','')));
  title text := btrim(coalesce(p_body->>'productName',''));
  amount numeric;
begin
  select p.company_id into co
  from public.profiles p
  join public.companies c on c.id=p.company_id
  where p.id=p_user
    and p.role='owner'
    and p.is_active is distinct from false
    and c.is_active=true;

  if co is null then
    raise exception '활성 관리자만 제품을 등록할 수 있습니다.'
      using errcode='42501';
  end if;

  rid := (p_body->>'requestId')::uuid;

  if rid is null then
    raise exception '저장 요청 번호가 필요합니다.'
      using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('register-film:'||rid::text,0)
  );

  select * into previous
  from public.film_product_registration_requests
  where id=rid;

  if found then
    if previous.company_id<>co
      or previous.actor<>p_user
      or previous.payload is distinct from p_body
    then
      raise exception '다른 내용에 사용된 저장 요청입니다.'
        using errcode='40001';
    end if;

    pid := previous.product_id;
  else
    if length(brand_name) not between 1 and 100
      or length(code) not between 1 and 80
      or length(title)>200
    then
      raise exception '브랜드와 제품번호를 입력해주세요. 제품명은 200자까지 입력할 수 있습니다.'
        using errcode='22023';
    end if;

    amount := nullif(p_body->>'unitPrice','')::numeric;

    if amount is null
      or amount<0
      or amount>10000000
      or amount::text in ('NaN','Infinity','-Infinity')
    then
      raise exception '1m당 공급가를 0~10,000,000원으로 입력해주세요.'
        using errcode='22023';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        'film-product:'||lower(brand_name)||':'||lower(code),
        0
      )
    );

    select * into item
    from public.film_products
    where lower(btrim(brand))=lower(brand_name)
      and lower(btrim(product_code))=lower(code)
    order by is_active desc nulls last, created_at, id
    limit 1;

    if found then
      if item.is_active is distinct from true then
        raise exception '사용 중지된 제품입니다. 제품 관리자에게 확인해주세요.'
          using errcode='22023';
      end if;

      pid := item.id;
    else
      insert into public.film_products(
        brand,
        product_code,
        product_name,
        is_active,
        is_order_available
      )
      values(
        brand_name,
        code,
        nullif(title,''),
        true,
        false
      )
      returning id into pid;
    end if;

    if exists (
      select 1
      from public.film_dealer_prices
      where company_id=co
        and dealer_id=(p_body->>'dealerId')::uuid
        and product_id=pid
        and price_type=p_body->>'priceType'
    ) then
      raise exception '이미 공급가가 등록된 제품입니다. 등록을 취소하고 전체 검색에서 선택해주세요.'
        using errcode='22023';
    end if;

    result := public.film_dealers(
      p_user,
      'price',
      jsonb_build_object(
        'action','price',
        'requestId',rid,
        'dealerId',p_body->>'dealerId',
        'productId',pid,
        'priceType',p_body->>'priceType',
        'unitPrice',amount,
        'priceRevision',0
      )
    );

    insert into public.film_product_registration_requests(
      id,
      company_id,
      actor,
      payload,
      product_id
    )
    values(
      rid,
      co,
      p_user,
      p_body,
      pid
    );
  end if;

  if result is null then
    result := public.film_dealers(p_user,'get','{}');
  end if;

  select * into item
  from public.film_products
  where id=pid;

  return result || jsonb_build_object(
    'registeredProduct',
    jsonb_build_object(
      'id',item.id,
      'brand',item.brand,
      'product_code',item.product_code,
      'product_name',item.product_name,
      'sample_image_path',item.sample_image_path
    )
  );
end;
$function$

