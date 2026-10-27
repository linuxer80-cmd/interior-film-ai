-- Scope a product card's GET to that product's rolls. Keep all trip history for
-- manual/roll tracking, and preserve the existing write authorization and locks.
do $patch$
declare
 definition text;
 old_text text;
 new_text text;
begin
 select pg_get_functiondef('public.film_stock(uuid,uuid,text,jsonb)'::regprocedure) into definition;
 if position('stockSnapshotVersion' in definition)>0 then return; end if;

 old_text := ' total_issue numeric;';
 if position(old_text in definition)=0 then raise exception 'Unexpected stock declarations'; end if;
 definition := replace(definition,old_text,old_text||E'\n scope_material uuid;');

 old_text := $old$ if p_action<>'get' then$old$;
 new_text := $scope$
 if p_action='get' and nullif(p_body->>'materialId','') is not null then
   scope_material := (p_body->>'materialId')::uuid;
   if not exists(select 1 from public.site_materials candidate
     where candidate.id=scope_material and candidate.site_id=p_site and candidate.company_id=company
       and candidate.material_type='planned' and candidate.removed_at is null) then
     raise exception '사용 필름이 변경되었습니다. 현장을 다시 열어주세요.' using errcode='22023';
   end if;
 end if;

 if p_action<>'get' then$scope$;
 if position(old_text in definition)=0 then raise exception 'Unexpected stock action guard'; end if;
 definition := replace(definition,old_text,new_text);

 old_text := $old$'materials',coalesce(state->'materials','[]'::jsonb),$old$;
 new_text := $new$'stockSnapshotVersion',1,
   'materials',coalesce((
     select jsonb_agg(entry.value || jsonb_build_object('price_type',coalesce(sm.price_type,'unspecified')) order by entry.position)
     from jsonb_array_elements(coalesce(state->'materials','[]'::jsonb)) with ordinality entry(value,position)
     join public.site_materials sm on sm.id=(entry.value->>'id')::uuid
       and sm.site_id=p_site and sm.company_id=company and sm.removed_at is null
   ),'[]'::jsonb),$new$;
 if position(old_text in definition)=0 then raise exception 'Unexpected stock materials'; end if;
 definition := replace(definition,old_text,new_text);

 old_text := $old$and material.material_type='planned'$old$;
 new_text := old_text||E'\n          and material.removed_at is null\n          and (scope_material is null or material.id=scope_material)';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>2 then
   raise exception 'Unexpected stock match predicates';
 end if;
 definition := replace(definition,old_text,new_text);
 old_text := E'or trip.site_id=p_site\n';
 if position(old_text in definition)=0 then raise exception 'Unexpected site stock filter'; end if;
 definition := replace(definition,old_text,E'or (trip.site_id=p_site and (scope_material is null or trip.material_id=scope_material))\n');

 definition := replace(definition,'select stock.*,s.site_name,',
   'select stock.*,s.site_name,coalesce(purchase.price_type,''unspecified'') as price_type,');
 definition := replace(definition,'from public.film_stock_rolls stock',
   E'from public.film_stock_rolls stock\n       left join public.film_roll_purchases purchase on purchase.roll_id=stock.id and purchase.company_id=stock.company_id');
 definition := replace(definition,'stock.product_code,stock.revision',
   'stock.product_code,stock.revision,coalesce(purchase.price_type,''unspecified'') as price_type');
 definition := replace(definition,'on stock.id=trip.roll_id',
   E'on stock.id=trip.roll_id\n       left join public.film_roll_purchases purchase on purchase.roll_id=stock.id and purchase.company_id=stock.company_id');
 execute definition;
end;
$patch$;

revoke all on function public.film_stock(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.film_stock(uuid,uuid,text,jsonb) to service_role;
