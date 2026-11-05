begin;
alter table public.site_material_issues alter column created_by drop not null;
alter table public.site_material_issues alter column voided_by drop not null;
alter table public.site_material_returns alter column updated_by drop not null;
alter table public.site_material_return_history alter column created_by drop not null;
alter table public.film_stock_rolls alter column created_by drop not null;
alter table app_private.actual_material_manual_prices alter column updated_by drop not null;
create or replace function app_private.is_deletion_material_actor_scrub(before_row jsonb,after_row jsonb,actor_keys text[])
returns boolean language plpgsql security definer set search_path=''
as $f$ declare k text; changed boolean:=false;
begin
 if (before_row-actor_keys) is distinct from (after_row-actor_keys) then return false; end if;
 foreach k in array actor_keys loop
   if before_row->k is distinct from after_row->k then
     if after_row->k is distinct from 'null'::jsonb then return false; end if;
     if not exists(select 1 from public.account_deletion_blocks where user_id::text=before_row->>k) then return false; end if;
     changed:=true;
   end if;
 end loop;
 return changed;
end;$f$;
revoke all on function app_private.is_deletion_material_actor_scrub(jsonb,jsonb,text[]) from public,anon,authenticated;
create or replace function app_private.guard_removed_material_flow()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare stamp timestamptz;
begin
 if tg_op='UPDATE' and app_private.is_deletion_material_actor_scrub(to_jsonb(old),to_jsonb(new),array['created_by','voided_by']) then return new; end if;
 select removed_at into stamp from public.site_materials where id=new.material_id for update;
 if stamp is not null then raise exception '현장 목록에서 제외된 자재입니다. 새 자재를 등록해주세요.' using errcode='22023'; end if;
 return new;
end;$f$;
create or replace function app_private.guard_roll_material_flow()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare mat uuid;
begin
 if tg_op='UPDATE' and app_private.is_deletion_material_actor_scrub(to_jsonb(old),to_jsonb(new),
 case when tg_table_name='site_material_returns' then array['updated_by'] else array['created_by','voided_by'] end) then return new; end if;
 mat:=case when tg_op='DELETE' then old.material_id else new.material_id end;
 if current_setting('app.roll_inventory',true) is distinct from 'on' and
 (exists(select 1 from public.film_stock_trips where material_id=mat) or
 (tg_op='UPDATE' and exists(select 1 from public.film_stock_trips where material_id=old.material_id))) then
 raise exception '롤 재고로 관리하는 자재입니다. 보고서의 롤 반출·반입에서 처리해주세요.' using errcode='22023'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;$f$;
create or replace function public.scrub_account_material_actors(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 update public.site_material_issues set created_by=case when created_by=u then null else created_by end,voided_by=case when voided_by=u then null else voided_by end where created_by=u or voided_by=u;
 update public.site_material_returns set updated_by=case when updated_by=u then null else updated_by end where updated_by=u;
 update public.site_material_return_history set created_by=case when created_by=u then null else created_by end where created_by=u;
 update public.film_stock_rolls set created_by=case when created_by=u then null else created_by end where created_by=u;
 update app_private.actual_material_manual_prices set updated_by=case when updated_by=u then null else updated_by end where updated_by=u;
 if exists(select 1 from public.site_material_issues where created_by=u or voided_by=u) or exists(select 1 from public.site_material_returns where updated_by=u) or exists(select 1 from public.site_material_return_history where created_by=u) or exists(select 1 from public.film_stock_rolls where created_by=u) or exists(select 1 from app_private.actual_material_manual_prices where updated_by=u) then raise exception 'Material actor cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_material_actors(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_material_actors(uuid,uuid) to service_role;
commit;
