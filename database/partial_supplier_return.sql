-- Partial supplier returns preserve remaining warehouse stock. Existing whole-roll requests remain supported.
begin;
CREATE OR REPLACE FUNCTION public.film_stock(p_user uuid, p_site uuid DEFAULT NULL::uuid, p_action text DEFAULT 'get'::text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 company uuid;
 owner_access boolean;
 state jsonb;
 can_edit boolean:=false; can_return_roll boolean:=false;
 r public.film_stock_rolls%rowtype;
 t public.film_stock_trips%rowtype;
 m public.site_materials%rowtype;
 ev public.film_stock_events%rowtype;
 request_id uuid;
 qty numeric;
 before_qty numeric;
 total_return numeric;
 old_return numeric;
 total_issue numeric;
 mat uuid;
 was text;
begin
 if p_user is null then
   raise exception '로그인이 필요합니다.' using errcode='42501';
 end if;

 if p_site is not null then
   state:=public.site_operations(p_user,p_site,'get','{}');
   select company_id into company
   from public.sites where id=p_site;
 else
   select company_id into company
   from public.profiles
   where id=p_user
     and role='owner'
     and is_active is distinct from false;
 end if;

 if company is null or not exists(
   select 1 from public.companies
   where id=company and is_active=true
 ) then
   raise exception '활성 회사 정보를 확인해주세요.'
     using errcode='42501';
 end if;

 select exists(
   select 1 from public.profiles
   where id=p_user and company_id=company
     and role='owner'
     and is_active is distinct from false
 ) into owner_access;

 if not owner_access and (
   p_site is null or not exists(
     select 1 from public.workers
     where user_id=p_user
       and company_id=company
       and is_active=true
   )
 ) then
   raise exception '접근 권한이 없습니다.'
     using errcode='42501';
 end if;

 can_edit:=
   p_site is not null
   and coalesce((state->>'canReturn')::boolean,false)
   and not coalesce((state->>'locked')::boolean,true);

 can_return_roll := p_site is not null and coalesce((state->>'canReturn')::boolean,false);
 if p_action not in (
   'get','receive','issue','return','correct_return','supplier_return'
 ) then
   raise exception '지원하지 않는 요청입니다.'
     using errcode='22023';
 end if;

 if p_action<>'get' then
   if p_action in ('receive','supplier_return')
      and (not owner_access or p_site is not null) then
     raise exception '관리자 재고 화면에서 처리해주세요.'
       using errcode='42501';
   end if;

   if (p_action='correct_return' and not can_edit) or (p_action='issue' and not can_edit) or (p_action='return' and not can_return_roll) then
     raise exception
       '수정 가능한 현장의 책임 담당자만 처리할 수 있습니다.'
       using errcode='42501';
   end if;

   request_id:=(p_body->>'requestId')::uuid;

   if request_id is null then
     raise exception '저장 요청을 확인해주세요.'
       using errcode='22023';
   end if;

   perform pg_advisory_xact_lock(
     hashtextextended(request_id::text,0)
   );

   select * into ev
   from public.film_stock_events
   where id=request_id;

   if found then
     if ev.company_id<>company
        or ev.actor<>p_user
        or ev.action<>p_action
        or ev.site_id is distinct from p_site
        or ev.payload is distinct from p_body then
       raise exception '이미 사용한 저장 요청입니다.'
         using errcode='40001';
     end if;

     return public.film_stock(p_user,p_site,'get','{}');
   end if;

   if p_action='receive' then
     qty:=nullif(btrim(p_body->>'length'),'')::numeric;

     if qty is null or qty<=0 or qty>1000000
        or qty::text in ('NaN','Infinity','-Infinity') then
       raise exception '롤 길이를 확인해주세요.'
         using errcode='22023';
     end if;

     if nullif(btrim(p_body->>'label'),'') is null
        or nullif(btrim(p_body->>'brand'),'') is null
        or nullif(btrim(p_body->>'code'),'') is null
        or nullif(btrim(p_body->>'supplier'),'') is null then
       raise exception
         '롤 이름·브랜드·제품 번호·자재상을 입력해주세요.'
         using errcode='22023';
     end if;

     insert into public.film_stock_rolls(
       company_id,label,brand,product_code,
       supplier,location,remaining,created_by
     )
     values(
       company,
       btrim(p_body->>'label'),
       btrim(p_body->>'brand'),
       upper(btrim(p_body->>'code')),
       btrim(p_body->>'supplier'),
       coalesce(nullif(btrim(p_body->>'location'),''),'창고'),
       qty,p_user
     )
     returning * into r;

     before_qty:=0;
   else
     select * into r
     from public.film_stock_rolls
     where id=(p_body->>'rollId')::uuid
       and company_id=company
     for update;

     if not found then
       raise exception '본인 회사의 롤만 처리할 수 있습니다.'
         using errcode='42501';
     end if;

     if r.revision is distinct from
        (p_body->>'revision')::integer then
       raise exception
         '다른 담당자가 재고를 변경했습니다. 새로고침해주세요.'
         using errcode='40001';
     end if;

     before_qty:=r.remaining;

     if p_action='supplier_return' then
       if r.status<>'available' then
         raise exception
           '보관 중인 롤만 자재상에 반납할 수 있습니다.'
           using errcode='22023';
       end if;

       qty:=coalesce(nullif(btrim(p_body->>'returnLength'),'')::numeric,r.remaining);
       if qty is null or qty<=0 or qty>r.remaining
          or qty::text in ('NaN','Infinity','-Infinity') then
         raise exception '반납 길이는 0보다 크고 현재 창고 잔량 이하여야 합니다.'
           using errcode='22023';
       end if;
       update public.film_stock_rolls
       set remaining=r.remaining-qty,
           status=case when r.remaining-qty=0 then 'supplier_returned' else 'available' end,
           revision=revision+1
       where id=r.id;

     elsif p_action='issue' then
       if r.status<>'available' or r.remaining<=0 then
         raise exception
           '이미 반출되었거나 사용할 수 없는 롤입니다.'
           using errcode='40001';
       end if;

       select * into m
       from public.site_materials
       where id=(p_body->>'materialId')::uuid
         and site_id=p_site
         and company_id=company
         and material_type='planned'
       for update;

       if not found then
         raise exception '사용 필름을 먼저 등록해주세요.'
           using errcode='22023';
       end if;

       if coalesce(lower(btrim(m.unit)),'')
          not in ('m','미터') then
         raise exception
           '롤 재고는 미터(m) 단위 자재에만 연결할 수 있습니다. 관리자에게 단위 수정을 요청해주세요.'
           using errcode='22023';
       end if;

       if not app_private.roll_matches_material(r.id,m.brand,m.product_code,m.price_type) then
         raise exception
           '현장 필름과 롤의 브랜드·제품 번호가 다릅니다.'
           using errcode='22023';
       end if;

       if not exists(
         select 1 from public.film_stock_trips
         where material_id=m.id
       )
       and (
         exists(
           select 1 from public.site_material_issues
           where material_id=m.id
         )
         or exists(
           select 1 from public.site_material_returns
           where material_id=m.id
         )
       ) then
         raise exception
           '기존 수동 반출·반입 기록이 있는 자재는 롤 재고와 혼합할 수 없습니다. 새 자재 항목으로 등록해주세요.'
           using errcode='22023';
       end if;

       mat:=m.id;
       qty:=r.remaining;

       insert into public.film_stock_trips(
         company_id,roll_id,site_id,
         material_id,issued,issued_by
       )
       values(
         company,r.id,p_site,m.id,r.remaining,p_user
       )
       returning * into t;

       update public.film_stock_rolls
       set status='on_site',revision=revision+1
       where id=r.id;

     elsif p_action='correct_return' then
       select * into t from public.film_stock_trips
       where id=(p_body->>'tripId')::uuid and roll_id=r.id
         and site_id=p_site and company_id=company and returned is not null
       for update;
       if not found then
         raise exception '반납 완료 기록을 확인해주세요.' using errcode='22023';
       end if;
       if r.status not in ('available','used_up')
          or r.remaining is distinct from t.returned
          or exists(select 1 from public.film_stock_trips newer
            where newer.roll_id=r.id and newer.id<>t.id
              and newer.issued_at>=t.issued_at)
          or exists(select 1 from public.film_stock_events e
            where e.roll_id=r.id and e.created_at>=t.returned_at
              and e.action not in ('return','correct_return')) then
         raise exception '반납 후 다시 이동한 롤은 수정할 수 없습니다. 관리자에게 확인해주세요.' using errcode='40001';
       end if;
       if t.returned is distinct from (p_body->>'expectedReturned')::numeric then
         raise exception '반납 수량이 변경되었습니다. 새로고침해주세요.' using errcode='40001';
       end if;
       qty:=nullif(btrim(p_body->>'remaining'),'')::numeric;
       if qty is null or qty<0 or qty>t.issued
          or qty::text in ('NaN','Infinity','-Infinity') then
         raise exception '남은 길이는 0 이상 반출 길이 이하여야 합니다.' using errcode='22023';
       end if;
       mat:=t.material_id;
       update public.film_stock_trips set returned=qty,returned_by=p_user where id=t.id;
       update public.film_stock_rolls set remaining=qty,
         status=case when qty=0 then 'used_up' else 'available' end,
         revision=revision+1 where id=r.id;
     else
       select * into t
       from public.film_stock_trips
       where roll_id=r.id
         and site_id=p_site
         and company_id=company
         and returned is null
       for update;

       if not found or r.status<>'on_site' then
         raise exception
           '이 현장에 반출 중인 롤이 아닙니다.'
           using errcode='40001';
       end if;

       qty:=nullif(btrim(p_body->>'remaining'),'')::numeric;

       if qty is null or qty<0 or qty>t.issued
          or qty::text in ('NaN','Infinity','-Infinity') then
         raise exception
           '남은 길이는 0 이상 반출 길이 이하여야 합니다.'
           using errcode='22023';
       end if;

       mat:=t.material_id;

       update public.film_stock_trips
       set returned=qty,
           returned_at=now(),
           returned_by=p_user
       where id=t.id;

       update public.film_stock_rolls
       set remaining=qty,
           status=case when qty=0
             then 'used_up' else 'available' end,
           location=coalesce(
             nullif(btrim(p_body->>'location'),''),
             '창고'
           ),
           revision=revision+1
       where id=r.id;
     end if;
   end if;

   if mat is not null then
     was:=current_setting('app.roll_inventory',true);
     perform set_config('app.roll_inventory','on',true);

     if p_action='issue' then
       insert into public.site_material_issues(
         id,company_id,site_id,
         material_id,quantity,created_by
       )
       values(t.id,company,p_site,mat,t.issued,p_user);
     end if;

     select quantity into old_return
     from public.site_material_returns
     where material_id=mat;

     if exists(
       select 1 from public.film_stock_trips
       where material_id=mat and returned is null
     ) then
       total_return:=null;

       delete from public.site_material_returns
       where material_id=mat;
     else
       select sum(returned) into total_return
       from public.film_stock_trips
       where material_id=mat;

       insert into public.site_material_returns(
         material_id,company_id,site_id,
         quantity,updated_by
       )
       values(mat,company,p_site,total_return,p_user)
       on conflict(material_id)
       do update set
         quantity=excluded.quantity,
         updated_by=p_user,
         updated_at=now();
     end if;

     insert into public.site_material_return_history(
       site_id,company_id,material_id,
       before_quantity,after_quantity,reason,created_by
     )
     values(
       p_site,company,mat,old_return,total_return,
       '롤 재고 ' ||
       case when p_action='issue'
         then '반출: ' when p_action='correct_return' then '반납 수정: ' else '반입: ' end || r.label,
       p_user
     );

     perform set_config(
       'app.roll_inventory',
       coalesce(was,'off'),
       true
     );
   end if;

   insert into public.film_stock_events(
     id,company_id,roll_id,site_id,action,
     before_qty,after_qty,memo,actor,payload
   )
   values(
     request_id,company,r.id,p_site,p_action,
     before_qty,qty,left(p_body->>'memo',1000),
     p_user,p_body
   );
 end if;

 return jsonb_build_object(
   'owner',owner_access,
   'canEdit',can_edit,'canIssue',can_edit,'canReturnRoll',can_return_roll,
   'locked',coalesce((state->>'locked')::boolean,false),
   'materials',coalesce(state->'materials','[]'::jsonb),
   'rolls',coalesce((
     select jsonb_agg(to_jsonb(x) order by x.created_at desc)
     from (
       select stock.*,s.site_name,
      array(
        select material.id
        from public.site_materials material
        where material.site_id=p_site
          and material.company_id=company
          and material.material_type='planned'
          and app_private.roll_matches_material(stock.id,material.brand,material.product_code,material.price_type)
      ) as matching_material_ids
       from public.film_stock_rolls stock
       left join public.film_stock_trips trip
         on trip.roll_id=stock.id and trip.returned is null
       left join public.sites s
         on s.id=trip.site_id and s.company_id=company
       where stock.company_id=company
         and (
           p_site is null
           or trip.site_id=p_site
           or (
             stock.status='available'
             and exists(
               select 1 from public.site_materials material
               where material.site_id=p_site
                 and material.company_id=company
                 and material.material_type='planned'
                 and app_private.roll_matches_material(stock.id,material.brand,material.product_code,material.price_type)
             )
           )
         )
     ) x
   ),'[]'::jsonb),
   'trips',coalesce((
     select jsonb_agg(to_jsonb(x) order by x.issued_at desc)
     from (
       select trip.*,stock.label,stock.brand,
         stock.product_code,stock.revision
       from public.film_stock_trips trip
       join public.film_stock_rolls stock
         on stock.id=trip.roll_id
       where trip.company_id=company
         and (p_site is null or trip.site_id=p_site)
     ) x
   ),'[]'::jsonb),
   'events',case when p_site is null then coalesce((
     select jsonb_agg(to_jsonb(x))
     from (
       select e.id,e.action,e.before_qty,e.after_qty,
         e.memo,e.created_at,stock.label,
         stock.brand,stock.product_code
       from public.film_stock_events e
       join public.film_stock_rolls stock
         on stock.id=e.roll_id
       where e.company_id=company
       order by e.created_at desc
       limit 100
     ) x
   ),'[]'::jsonb) else '[]'::jsonb end
 );
end $function$
;
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
;
commit;

