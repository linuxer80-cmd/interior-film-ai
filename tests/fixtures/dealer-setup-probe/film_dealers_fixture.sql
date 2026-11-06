CREATE OR REPLACE FUNCTION public.film_dealers(p_user uuid, p_action text DEFAULT 'get'::text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 co uuid;
 d public.film_dealers%rowtype;
 pr public.film_dealer_prices%rowtype;
 product public.film_products%rowtype;
 req public.film_dealer_requests%rowtype;
 roll public.film_stock_rolls%rowtype;
 rid uuid;
 child uuid;
 new_roll uuid;
 kind text;
 amount numeric;
 metres numeric;
 copies integer;
 i integer;
 q text;
 found_products jsonb;
begin
 select p.company_id into co
 from public.profiles p
 join public.companies c on c.id=p.company_id
 where p.id=p_user
   and p.role='owner'
   and p.is_active is distinct from false
   and c.is_active=true;

 if co is null then
   raise exception '본인 업체의 활성 관리자만 이용할 수 있습니다.'
     using errcode='42501';
 end if;

 if p_action='search' then
   q:=btrim(coalesce(p_body->>'query',''));

   if length(q)<1 or length(q)>80 then
     raise exception '검색어는 1~80자로 입력해주세요.'
       using errcode='22023';
   end if;

   q:='%'||
     replace(
       replace(
         replace(q,E'\\',E'\\\\'),
         '%',E'\\%'
       ),
       '_',E'\\_'
     )||'%';

   select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
   into found_products
   from (
     select
       f.id,f.brand,f.product_code,
       f.product_name,f.sample_image_path
     from public.film_products f
     where f.is_active=true
       and (
         (f.product_code ilike q or f.legacy_non_fire_code ilike q)
         or f.product_name ilike q
       )
     order by f.brand,f.product_code,f.id
     limit 40
   ) x;

   return jsonb_build_object('products',found_products);
 end if;

 if p_action not in (
   'get','dealer','price','receive','supplier_return'
 ) then
   raise exception '지원하지 않는 요청입니다.'
     using errcode='22023';
 end if;

 if p_action<>'get' then
   rid:=(p_body->>'requestId')::uuid;

   if rid is null then
     raise exception '저장 요청 번호가 필요합니다.'
       using errcode='22023';
   end if;

   perform pg_advisory_xact_lock(
     hashtextextended(rid::text,0)
   );

   select * into req
   from public.film_dealer_requests
   where id=rid;

   if found then
     if req.company_id<>co
       or req.actor<>p_user
       or req.action<>p_action
       or req.payload is distinct from p_body
     then
       raise exception '다른 내용에 사용된 저장 요청입니다.'
         using errcode='40001';
     end if;

     return public.film_dealers(p_user,'get','{}');
   end if;

   if p_action='dealer' then
     if nullif(btrim(p_body->>'name'),'') is null
       or length(p_body->>'name')>100
       or length(coalesce(p_body->>'phone',''))>100
       or length(coalesce(p_body->>'brands',''))>200
     then
       raise exception '대리점 이름·연락처·취급 브랜드를 확인해주세요.'
         using errcode='22023';
     end if;

     if nullif(p_body->>'dealerId','') is null then
       insert into public.film_dealers(
         company_id,name,phone,brands
       )
       values(
         co,
         btrim(p_body->>'name'),
         coalesce(p_body->>'phone',''),
         coalesce(p_body->>'brands','')
       );
     else
       update public.film_dealers
       set
         name=btrim(p_body->>'name'),
         phone=coalesce(p_body->>'phone',''),
         brands=coalesce(p_body->>'brands',''),
         revision=revision+1
       where id=(p_body->>'dealerId')::uuid
         and company_id=co
         and revision=(p_body->>'revision')::integer;

       if not found then
         raise exception '대리점 정보가 변경되었거나 접근할 수 없습니다. 새로고침해주세요.'
           using errcode='40001';
       end if;
     end if;

   elsif p_action in ('price','receive') then
     kind:=p_body->>'priceType';

     if kind is null
       or kind not in ('fire','non_fire','unspecified')
     then
       raise exception '방염 구분을 선택해주세요. 화면을 새로고침해주세요.'
         using errcode='22023';
     end if;

     select * into d
     from public.film_dealers
     where id=(p_body->>'dealerId')::uuid
       and company_id=co
     for update;

     if not found then
       raise exception '본인 업체의 대리점만 선택할 수 있습니다.'
         using errcode='42501';
     end if;

     select * into product
     from public.film_products
     where id=(p_body->>'productId')::uuid
       and is_active=true;

     if not found
       or nullif(btrim(product.brand),'') is null
       or nullif(btrim(product.product_code),'') is null
     then
       raise exception '활성 필름 제품을 선택해주세요.'
         using errcode='22023';
     end if;

     select * into pr
     from public.film_dealer_prices
     where company_id=co
       and dealer_id=d.id
       and product_id=product.id
       and price_type=kind
     for update;

     if coalesce(pr.revision,0)
       is distinct from (p_body->>'priceRevision')::integer
     then
       raise exception '공급가가 변경되었습니다. 새로고침 후 확인해주세요.'
         using errcode='40001';
     end if;

     if p_action='price' then
       amount:=nullif(p_body->>'unitPrice','')::numeric;

       if amount is null
         or amount<0
         or amount>10000000
         or amount::text in ('NaN','Infinity','-Infinity')
       then
         raise exception '1m당 공급가를 0원 이상 입력해주세요.'
           using errcode='22023';
       end if;

       insert into public.film_dealer_prices(
         company_id,dealer_id,product_id,unit_price,price_type
       )
       values(co,d.id,product.id,amount,kind)
       on conflict(company_id,dealer_id,product_id,price_type)
       do update set
         unit_price=excluded.unit_price,
         revision=film_dealer_prices.revision+1;

     else
       if pr.id is null then
         raise exception '대리점 관리에서 이 제품의 공급가를 먼저 등록해주세요.'
           using errcode='22023';
       end if;

       metres:=nullif(p_body->>'length','')::numeric;
       copies:=(p_body->>'count')::integer;

       if metres is null
         or metres<=0
         or metres>1000000
         or metres::text in ('NaN','Infinity','-Infinity')
         or copies is null
         or copies<1
         or copies>50
       then
         raise exception '길이는 0 초과, 롤 수는 1~50개로 입력해주세요.'
           using errcode='22023';
       end if;

       for i in 1..copies loop
         child:=gen_random_uuid();

         perform public.film_stock(
           p_user,
           null,
           'receive',
           jsonb_build_object(
             'requestId',child,
             'label',
               upper(product.product_code)||'-'||
               case kind
                 when 'fire' then '방염'
                 when 'non_fire' then '비방염'
                 else '구분미지정'
               end||'-'||child::text,
             'brand',product.brand,
             'code',product.product_code,
             'length',metres,
             'supplier',d.name,
             'location',left(
               coalesce(
                 nullif(btrim(p_body->>'location'),''),
                 '창고'
               ),
               100
             ),
             'memo',left(p_body->>'memo',1000)
           )
         );

         select e.roll_id into new_roll
         from public.film_stock_events e
         where e.id=child and e.company_id=co;

         insert into public.film_roll_purchases(
           roll_id,company_id,dealer_id,product_id,
           product_name,initial_length,unit_price,price_type
         )
         values(
           new_roll,co,d.id,product.id,
           product.product_name,metres,pr.unit_price,kind
         );
       end loop;
     end if;

   else
     select * into roll
     from public.film_stock_rolls
     where id=(p_body->>'rollId')::uuid
       and company_id=co
     for update;

     if not found then
       raise exception '본인 업체의 롤만 반납할 수 있습니다.'
         using errcode='42501';
     end if;

     if nullif(p_body->>'dealerId','') is not null and not exists(
       select 1 from public.film_roll_purchases
       where roll_id=roll.id and company_id=co and dealer_id=(p_body->>'dealerId')::uuid
     ) then
       raise exception '선택한 거래처에서 입고한 롤만 반납할 수 있습니다.' using errcode='22023';
     end if;

     amount:=nullif(p_body->>'credit','')::numeric;

     if amount is not null and (
       amount<0
       or amount>1000000000000
       or amount::text in ('NaN','Infinity','-Infinity')
     ) then
       raise exception '반납 정산금액을 확인해주세요.'
         using errcode='22023';
     end if;

     if amount is not null and not exists(
       select 1
       from public.film_roll_purchases
       where roll_id=roll.id and company_id=co
     ) then
       raise exception '기존 재고는 입고단가 정보가 없어 반납금액을 기록할 수 없습니다.'
         using errcode='22023';
     end if;

     perform public.film_stock(
       p_user,
       null,
       'supplier_return',
       jsonb_build_object(
         'requestId',rid,
         'rollId',roll.id,
         'revision',p_body->'revision',
         'returnLength',p_body->'returnLength'
       )
     );

     update public.film_roll_purchases
     set return_credit=case when amount is null then return_credit else coalesce(return_credit,0)+amount end
     where roll_id=roll.id and company_id=co;
   end if;

   insert into public.film_dealer_requests(
     id,company_id,actor,action,payload
   )
   values(rid,co,p_user,p_action,p_body);
 end if;

 return jsonb_build_object(
   'dealers',
   coalesce((
     select jsonb_agg(to_jsonb(x) order by x.name)
     from public.film_dealers x
     where x.company_id=co
   ),'[]'::jsonb),

   'prices',
   coalesce((
     select jsonb_agg(to_jsonb(x))
     from (
       select
         dp.*,f.brand,f.product_code,f.product_name,
         f.sample_image_path,f.is_active
       from public.film_dealer_prices dp
       join public.film_products f on f.id=dp.product_id
       where dp.company_id=co
     ) x
   ),'[]'::jsonb),

   'purchases',
   coalesce((
     select jsonb_agg(to_jsonb(x))
     from public.film_roll_purchases x
     where x.company_id=co
   ),'[]'::jsonb),

   'stock',public.film_stock(p_user,null,'get','{}')
 );
end
$function$

