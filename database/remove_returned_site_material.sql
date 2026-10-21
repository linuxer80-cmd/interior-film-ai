begin;
alter table public.site_materials add column if not exists removed_at timestamptz;
alter table public.site_materials add column if not exists removed_by uuid;

create or replace function public.remove_returned_site_material(p_user uuid,p_site uuid,p_material uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare co uuid; m public.site_materials%rowtype; state jsonb; item jsonb; n numeric; r numeric; previous_flag text;
begin
 select p.company_id into co from public.profiles p join public.companies c on c.id=p.company_id
 where p.id=p_user and p.role='owner' and p.is_active is distinct from false and c.is_active=true;
 if co is null then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 perform 1 from public.sites where id=p_site and company_id=co and status<>'cancelled' for update;
 if not found then raise exception '수정 가능한 소속 현장을 확인해주세요.' using errcode='42501'; end if;
 select * into m from public.site_materials where id=p_material and site_id=p_site and company_id=co and material_type='planned' for update;
 if not found then raise exception '자재를 찾을 수 없습니다.' using errcode='22023'; end if;
 if m.removed_at is not null then return jsonb_build_object('success',true,'removed',true); end if;
 perform 1 from public.film_stock_trips where material_id=m.id for update;
 perform 1 from public.site_material_issues where material_id=m.id for update;
 if exists(select 1 from public.film_stock_trips where material_id=m.id and issued>0 and
   (returned_at is null or returned is null or returned<>issued)) then
  raise exception '전량 반납이 완료되지 않았거나 실제 사용량이 있습니다. 반출·반납 내역을 확인해주세요.' using errcode='22023';
 end if;
 state:=public.site_operations(p_user,p_site,'get','{}'::jsonb);
 select value into item from jsonb_array_elements(state->'materials') where value->>'id'=m.id::text;
 if item is null then raise exception '자재 반납 상태를 확인할 수 없습니다.' using errcode='22023'; end if;
 n:=(item->>'issued')::numeric; r:=(item->>'returned')::numeric;
 if n is null or n<0 or (n>0 and (r is null or r<>n or (item->>'used')::numeric is distinct from 0::numeric)) then
  raise exception '전량 반납·사용량 0인 자재만 목록에서 제외할 수 있습니다. 일부 사용한 자재는 비용 기록을 유지해야 합니다.' using errcode='22023';
 end if;
 previous_flag:=current_setting('app.material_removal',true);
 perform set_config('app.material_removal','on',true);
 update public.site_materials set removed_at=now(),removed_by=p_user where id=m.id;
 perform set_config('app.material_removal',coalesce(previous_flag,'off'),true);
 perform app_private.record_site_change(p_site,'전량 반납 자재 목록 제외: '||coalesce(nullif(m.product_code,''),m.product_name,'자재')||' · 반출·반납 이력 보존');
 return jsonb_build_object('success',true,'removed',true);
end $$;
revoke all on function public.remove_returned_site_material(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_returned_site_material(uuid,uuid,uuid) to service_role;

create or replace function app_private.guard_material_removal_metadata()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.removed_at,new.removed_by) is distinct from (old.removed_at,old.removed_by)
 and current_setting('app.material_removal',true) is distinct from 'on' then
 raise exception '전량 반납 확인 기능으로 자재를 제외해주세요.' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function app_private.guard_material_removal_metadata() from public,anon,authenticated;
drop trigger if exists guard_material_removal_metadata on public.site_materials;
create trigger guard_material_removal_metadata before update of removed_at,removed_by on public.site_materials for each row execute function app_private.guard_material_removal_metadata();

-- Future stock writes lock the same material row as removal and cannot reuse an excluded item.
create or replace function app_private.guard_removed_material_flow()
returns trigger language plpgsql security definer set search_path='' as $$
declare stamp timestamptz;
begin
 select removed_at into stamp from public.site_materials where id=new.material_id for update;
 if stamp is not null then raise exception '현장 목록에서 제외된 자재입니다. 새 자재를 등록해주세요.' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function app_private.guard_removed_material_flow() from public,anon,authenticated;
drop trigger if exists guard_removed_material_flow on public.film_stock_trips;
create trigger guard_removed_material_flow before insert or update on public.film_stock_trips for each row execute function app_private.guard_removed_material_flow();
drop trigger if exists guard_removed_material_flow on public.site_material_issues;
create trigger guard_removed_material_flow before insert or update on public.site_material_issues for each row execute function app_private.guard_removed_material_flow();
commit;
select '전량 반납 자재 목록 제외 설정 완료' as result;
