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

       update public.film_stock_rolls
       set status='supplier_returned',
           revision=revision+1
       where id=r.id;

       qty:=r.remaining;

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

       if not app_private.roll_matches_material(r.id,m.brand,m.product_code) then
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
          and app_private.roll_matches_material(
            stock.id,material.brand,material.product_code
          )
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
                 and app_private.roll_matches_material(stock.id,material.brand,material.product_code)
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
