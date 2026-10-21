-- 단가를 직접 저장할 때만 적용하는 관리자 전용 경로입니다.
begin;
create schema if not exists app_private;
grant usage on schema app_private to service_role;
create table if not exists app_private.actual_material_manual_prices (
 material_id uuid primary key references public.site_materials(id) on delete cascade,
 company_id uuid not null references public.companies(id),
 site_id uuid not null references public.sites(id),
 brand text not null,
 product_code text not null,
 unit text not null,
 unit_price numeric not null check(unit_price>=0 and unit_price<=100000000),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table app_private.actual_material_manual_prices enable row level security;
revoke all on app_private.actual_material_manual_prices from public,anon,authenticated;
grant select,insert,update,delete on app_private.actual_material_manual_prices to service_role;

-- 기존 롤 원가 함수는 유지하며, 관리자가 명시적으로 저장한 단가만 우선합니다.
do $$
declare def text; marker text;
begin
 def:=pg_get_functiondef('app_private.actual_roll_cost(public.site_materials)'::regprocedure);
 if position('manual_actual_price_v1' in def)=0 then
  marker:='begin';
  if position(marker in def)=0 then raise exception '롤 원가 함수 버전이 다릅니다.'; end if;
  def:=overlay(def placing E'begin\n  -- manual_actual_price_v1\n  if pg_catalog.has_table_privilege(current_user, ''app_private.actual_material_manual_prices'', ''SELECT'') then\n  if exists(select 1 from app_private.actual_material_manual_prices override_price where override_price.material_id=m.id and override_price.company_id=m.company_id and override_price.site_id=m.site_id and public.canonical_film_brand(override_price.brand)=public.canonical_film_brand(m.brand) and upper(btrim(override_price.product_code))=upper(btrim(m.product_code)) and override_price.unit=m.unit) then\n    return (select jsonb_build_object(''count'',1,''ready'',true,''quantity'',m.quantity,''total'',round(m.quantity*override_price.unit_price),''source'',''manual'') from app_private.actual_material_manual_prices override_price where override_price.material_id=m.id);\n  end if;\n  end if;' from position(marker in def) for length(marker));
  execute def;
 end if;
 def:=pg_get_functiondef('public.material_purchase_cost(uuid,uuid,jsonb)'::regprocedure);
 if position('manual_actual_price_v1' in def)=0 then
  marker:='''반출한 롤의 실제 입고원가''';
  if position(marker in def)=0 then raise exception '단가 조회 함수 버전이 다릅니다.'; end if;
  def:=replace(def,marker,'case when calc->>''source''=''manual'' then ''관리자 직접 입력 단가'' else ''반출한 롤의 실제 입고원가'' end /* manual_actual_price_v1 */');
  execute def;
 end if;
end $$;

create or replace function public.update_actual_material_price(p_user uuid,p_site uuid,p_material uuid,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare co uuid; m public.site_materials; price numeric; was text;
begin
 select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id where p.id=p_user and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
 if co is null then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 perform 1 from public.sites where id=p_site and company_id=co and status<>'cancelled' for update;
 if not found then raise exception '본인 업체의 현장을 확인해주세요.' using errcode='42501'; end if;
 select * into m from public.site_materials where id=p_material and company_id=co and site_id=p_site and material_type='actual' for update;
 if not found then raise exception '실제 사용 자재를 다시 확인해주세요.' using errcode='40001'; end if;
 if lower(btrim(m.unit)) not in ('m','미터') then raise exception '단가를 저장하기 전에 실제 사용량의 미터 단위를 확인해주세요.' using errcode='22023'; end if;
 if nullif(p_body->>'unit_price','') is null then raise exception '단가를 입력해주세요.' using errcode='22023'; end if;
 price:=(p_body->>'unit_price')::numeric;
 if price<0 or price>100000000 or price::text in ('NaN','Infinity','-Infinity') then raise exception '단가는 0~1억원 범위로 입력해주세요.' using errcode='22023'; end if;
 if (p_body->>'quantity')::numeric is distinct from m.quantity then raise exception '반출·반입 정산 사용량은 이 화면에서 바꿀 수 없습니다. 반입 기록을 수정해주세요.' using errcode='40001'; end if;
 if p_body ? 'updated_at' and nullif(p_body->>'updated_at','')::timestamptz is distinct from m.updated_at then raise exception '다른 작업으로 자재가 변경됐습니다. 새로고침 후 다시 저장해주세요.' using errcode='40001'; end if;
 if public.canonical_film_brand(p_body->>'brand') is distinct from public.canonical_film_brand(m.brand) or upper(btrim(p_body->>'product_code')) is distinct from upper(btrim(m.product_code)) or coalesce(p_body->>'product_name','') is distinct from coalesce(m.product_name,'') or p_body->>'unit' is distinct from m.unit or coalesce(p_body->>'memo','') is distinct from coalesce(m.memo,'') then
  raise exception '반출·반입 정산 자재는 단가만 수정할 수 있습니다. 제품 정보는 예정 자재와 반출 기록에서 확인해주세요.' using errcode='22023';
 end if;
 insert into app_private.actual_material_manual_prices(material_id,company_id,site_id,brand,product_code,unit,unit_price,updated_by)
 values(m.id,co,m.site_id,coalesce(m.brand,''),coalesce(m.product_code,''),m.unit,price,p_user)
 on conflict(material_id) do update set brand=excluded.brand,product_code=excluded.product_code,unit=excluded.unit,unit_price=excluded.unit_price,updated_by=excluded.updated_by,updated_at=now();
 was:=current_setting('app.material_settlement',true);
 perform set_config('app.material_settlement','on',true);
 update public.site_materials set unit_price=price,total_price=round(quantity*price),updated_at=now() where id=m.id and company_id=co and site_id=p_site;
 perform set_config('app.material_settlement',coalesce(was,'off'),true);
 return jsonb_build_object('success',true,'priceSource','manual');
end $$;
revoke all on function public.update_actual_material_price(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.update_actual_material_price(uuid,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
select '실제 사용 자재 관리자 단가 저장 설정 완료' as result;
