-- Preserve settled quantities, known fire variants and existing function privileges.
CREATE OR REPLACE FUNCTION public.material_purchase_cost(p_user uuid, p_material uuid, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 co uuid;
 sid uuid;
 m public.site_materials%rowtype;
 calc jsonb;
 opts jsonb:='[]';
 chosen jsonb;
 version text;
 was text;
begin
 select p.company_id into co
 from public.profiles p
 join public.companies c on c.id=p.company_id
 where p.id=p_user
   and p.role='owner'
   and p.is_active is distinct from false
   and c.is_active=true;

 if co is null then
  raise exception '관리자 권한이 필요합니다.'
   using errcode='42501';
 end if;

 select site_id into sid
 from public.site_materials
 where id=p_material
   and company_id=co
   and material_type='actual';

 perform 1
 from public.sites
 where id=sid
   and company_id=co
   and status<>'cancelled'
 for update;

 if not found then
  raise exception '수정 가능한 소속 현장 자재를 확인해주세요.'
   using errcode='42501';
 end if;

 select * into m
 from public.site_materials
 where id=p_material
   and company_id=co
 for update;

 if not found then
  raise exception '자재가 변경됐습니다.'
   using errcode='40001';
 end if;

 calc:=app_private.actual_roll_cost(m);

 if calc is not null then
  opts:=jsonb_build_array(
   jsonb_build_object(
    'id','roll',
    'label',case when calc->>'source'='manual' then '관리자 직접 입력 단가' else '반출한 롤의 실제 입고원가' end /* manual_actual_price_v1 */,
    'unitPrice',case
     when m.quantity=0 then 0
     else (calc->>'total')::numeric/m.quantity
    end,
    'total',(calc->>'total')::numeric
   )
  );
 else
  select coalesce(
   jsonb_agg(
    jsonb_build_object(
     'id',dp.id,
     'label',
      d.name||' · '||f.brand||' / '||f.product_code||' · '||
      case dp.price_type
       when 'fire' then '방염'
       when 'non_fire' then '비방염'
       else '구분 미지정'
      end||' · 현재 공급가',
     'priceType',dp.price_type,
     'unitPrice',dp.unit_price,
     'total',m.quantity*dp.unit_price
    )
    order by d.name,dp.price_type
   ),
   '[]'
  ) into opts
  from public.film_dealer_prices dp
  join public.film_dealers d
   on d.id=dp.dealer_id
   and d.company_id=co
  join public.film_products f
   on f.id=dp.product_id
  where dp.company_id=co
    and dp.price_type in ('fire','non_fire')
    and dp.unit_price is not null and dp.unit_price >= 0
    and (m.price_type is null or m.price_type not in ('fire','non_fire') or dp.price_type=m.price_type)
    and (
     (
      m.film_product_id is not null
      and f.id=m.film_product_id
     )
     or (
      m.film_product_id is null
      and upper(btrim(f.product_code))=
          upper(btrim(m.product_code))
      and app_private.film_brand_key(f.brand)=
          app_private.film_brand_key(m.brand)
     )
    );
 end if;

 version:=md5(to_jsonb(m)::text||opts::text);

 if p_body->>'action'='apply' then
  if p_body->>'version' is distinct from version then
   raise exception '수량 또는 단가가 변경됐습니다. 다시 조회해주세요.'
    using errcode='40001';
  end if;

  select value into chosen
  from jsonb_array_elements(opts)
  where value->>'id'=p_body->>'optionId';

  if chosen is null then
   raise exception '적용할 단가를 선택해주세요.'
    using errcode='22023';
  end if;

  if lower(btrim(m.unit)) not in ('m','미터')
     and coalesce(
      (p_body->>'confirmMetres')::boolean,
      false
     )=false then
   raise exception '사용량이 미터 단위인지 확인해주세요.'
    using errcode='22023';
  end if;

  was:=current_setting('app.material_settlement',true);

  perform set_config('app.material_settlement','on',true);

  update public.site_materials set
   unit='m',
   price_type=coalesce(chosen->>'priceType',m.price_type),
   unit_price=(chosen->>'unitPrice')::numeric,
   total_price=(chosen->>'total')::numeric,
   updated_at=now()
  where id=m.id
    and company_id=co;

  perform set_config(
   'app.material_settlement',
   coalesce(was,'off'),
   true
  );

  return jsonb_build_object('success',true);
 end if;

 return jsonb_build_object(
  'options',opts,
  'version',version,
  'quantity',m.quantity,
  'unit',m.unit
 );
end
$function$
;

CREATE OR REPLACE FUNCTION public.report_material_settlement(p_company uuid, p_site uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if (
    select count(*)
    from public.site_materials
    where company_id = p_company
      and site_id = p_site
      and material_type = 'planned' and removed_at is null
  ) > 100 then
    raise exception
      '사용 필름은 100개까지 등록할 수 있습니다.'
      using errcode = '22023';
  end if;

  -- 반출·반입량 확인은 계속 필수입니다.
  if exists (
    select 1
    from public.site_materials m
    left join public.site_material_returns r
      on r.material_id = m.id
      and r.site_id = p_site
      and r.company_id = p_company
    left join (
      select material_id, sum(quantity) qty
      from public.site_material_issues
      where company_id = p_company
        and site_id = p_site
        and voided_at is null
      group by material_id
    ) i on i.material_id = m.id
    where m.company_id = p_company
      and m.site_id = p_site
      and m.material_type = 'planned' and m.removed_at is null
      and (
        r.quantity is null
        or r.quantity < 0
        or r.quantity > coalesce(i.qty, 0)
        or r.quantity::text in (
          'NaN', 'Infinity', '-Infinity'
        )
        or coalesce(i.qty, 0)::text in (
          'NaN', 'Infinity', '-Infinity'
        )
        or coalesce(i.qty, 0) < 0
      )
  ) then
    raise exception
      '모든 필름의 반출·반입량을 저장해주세요. 사용하지 않은 필름은 0 / 0으로 저장해주세요.'
      using errcode = '22023';
  end if;

  -- 단가 NULL은 허용합니다.
  -- 입력된 단가가 음수 또는 비정상 숫자인 경우만 막습니다.
  if exists (
    select 1
    from public.site_materials m
    join public.site_material_returns r
      on r.material_id = m.id
      and r.site_id = p_site
      and r.company_id = p_company
    left join (
      select material_id, sum(quantity) qty
      from public.site_material_issues
      where company_id = p_company
        and site_id = p_site
        and voided_at is null
      group by material_id
    ) i on i.material_id = m.id
    where m.company_id = p_company
      and m.site_id = p_site
      and m.material_type = 'planned' and m.removed_at is null
      and coalesce(i.qty, 0) - r.quantity > 0
      and m.unit_price is not null
      and (
        m.unit_price < 0
        or m.unit_price::text in (
          'NaN', 'Infinity', '-Infinity'
        )
      )
  ) then
    raise exception
      '입력된 원가 단가가 올바르지 않습니다. 관리자가 확인해주세요.'
      using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'price_type', m.price_type, 'film_product_id', m.film_product_id,
        'brand', m.brand,
        'product_code', m.product_code,
        'product_name', m.product_name,
        'quantity', coalesce(i.qty, 0) - r.quantity,
        'unit', m.unit,
        'unit_price',
          case
            when coalesce(i.qty, 0) = r.quantity then 0
            else m.unit_price
          end,
        'memo',
          '반출반입 정산: '
          || coalesce(i.qty, 0)
          || ' - '
          || r.quantity
          || ' '
          || coalesce(m.unit, 'm')
          || case
               when coalesce(i.qty, 0) - r.quantity > 0
                 and m.unit_price is null
               then ' / 원가 단가 미입력'
               else ''
             end
      )
      order by m.id
    ),
    '[]'::jsonb
  )
  into result
  from public.site_materials m
  join public.site_material_returns r
    on r.material_id = m.id
    and r.site_id = p_site
    and r.company_id = p_company
  left join (
    select material_id, sum(quantity) qty
    from public.site_material_issues
    where company_id = p_company
      and site_id = p_site
      and voided_at is null
    group by material_id
  ) i on i.material_id = m.id
  where m.company_id = p_company
    and m.site_id = p_site
    and m.material_type = 'planned' and m.removed_at is null;

  return result;
end;
$function$
;

