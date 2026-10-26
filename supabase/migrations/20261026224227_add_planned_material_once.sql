-- Serialize additions to one site so repeat saves cannot split its stock history.
create or replace function public.add_planned_material_once(p_user uuid, p_site uuid, p_body jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 co uuid;
 material public.site_materials%rowtype;
 existing public.site_materials%rowtype;
begin
 select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id
 where p.id=p_user and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
 if co is null then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 perform 1 from public.sites where id=p_site and company_id=co and status<>'cancelled' for update;
 if not found then raise exception '수정 가능한 소속 현장을 확인해주세요.' using errcode='42501'; end if;

 material.id:=(p_body->>'id')::uuid;
 material.film_product_id:=nullif(p_body->>'film_product_id','')::uuid;
 material.brand:=public.canonical_film_brand(p_body->>'brand');
 material.product_code:=btrim(coalesce(p_body->>'product_code',''));
 material.product_name:=btrim(coalesce(p_body->>'product_name',''));
 material.price_type:=p_body->>'price_type';
 material.unit:=coalesce(nullif(btrim(p_body->>'unit'),''),'m');
 material.memo:=btrim(coalesce(p_body->>'memo',''));
 material.unit_price:=nullif(p_body->>'unit_price','')::numeric;
 if material.id is null or (material.product_code='' and material.product_name='')
 or material.price_type is null or material.price_type not in ('fire','non_fire')
 or (material.unit_price is not null and not(material.unit_price>=0 and material.unit_price<=100000000)) then
  raise exception '제품과 방염 구분·단가를 확인해주세요.' using errcode='22023';
 end if;

 select m.* into existing from public.site_materials m
 where m.company_id=co and m.site_id=p_site and m.material_type='planned' and m.removed_at is null
 and public.canonical_film_brand(m.brand)=material.brand
 and m.price_type=material.price_type
 and lower(coalesce(nullif(btrim(m.unit),''),'m'))=lower(material.unit)
 and btrim(coalesce(m.memo,''))=material.memo
 and (
  (m.film_product_id is not null and material.film_product_id is not null and m.film_product_id=material.film_product_id)
  or ((m.film_product_id is null or material.film_product_id is null) and
   case when material.product_code<>'' then upper(btrim(coalesce(m.product_code,'')))=upper(material.product_code)
   else coalesce(btrim(m.product_code),'')='' and upper(btrim(coalesce(m.product_name,'')))=upper(material.product_name) end)
 )
 order by exists(select 1 from public.site_material_issues i where i.material_id=m.id and i.voided_at is null) desc,
 m.created_at,m.id
 limit 1 for update;
 if found then
  -- Never overwrite a saved price, quantity or stock connection on a repeated add.
  return jsonb_build_object('success',true,'alreadyExists',true,'id',existing.id,'missingPrice',existing.unit_price is null);
 end if;
 if exists(select 1 from public.site_materials where id=material.id) then
  raise exception '이미 사용된 저장 요청입니다. 목록을 새로고침해주세요.' using errcode='23505';
 end if;
 insert into public.site_materials(id,company_id,site_id,material_type,created_by,
  film_product_id,brand,product_code,product_name,price_type,quantity,unit,unit_price,total_price,memo)
 values(material.id,co,p_site,'planned',p_user,
  material.film_product_id,material.brand,material.product_code,material.product_name,material.price_type,
  0,material.unit,material.unit_price,case when material.unit_price is null then null else 0 end,material.memo);
 return jsonb_build_object('success',true,'alreadyExists',false,'id',material.id,'missingPrice',material.unit_price is null);
end $$;
revoke all on function public.add_planned_material_once(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.add_planned_material_once(uuid,uuid,jsonb) to service_role;
