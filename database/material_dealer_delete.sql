begin;
alter table public.material_pilot_dealers
 drop constraint if exists material_pilot_dealers_status_check;
alter table public.material_pilot_dealers
 add constraint material_pilot_dealers_status_check
 check(status in ('pending','active','disabled','deleted'));

-- 삭제는 등록 목록에서만 제거하며 주문 참조와 계정은 보존합니다.
create or replace function public.material_pilot_dealer_delete_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='deleted' and new.status<>'deleted' then
  raise exception '삭제된 대리점은 다시 활성화할 수 없습니다.';
 end if;
 if new.status='deleted' and old.status<>'deleted' then
  if old.status<>'disabled' then
   raise exception '대리점을 먼저 중지해주세요.';
  end if;
  if exists(
   select 1 from public.material_pilot_orders
   where dealer_id=old.id
     and status not in ('received','cancelled')
  ) then
   raise exception '진행 중인 주문이 있습니다. 주문을 완료하거나 취소·재배정한 후 삭제해주세요.';
  end if;
 end if;
 return new;
end $$;

-- 배정과 삭제가 동시에 요청되어도 삭제된 대리점에 배정되지 않습니다.
create or replace function public.material_pilot_dealer_assign_guard()
returns trigger language plpgsql set search_path='' as $$
declare dealer_status text;
begin
 if new.dealer_id is null then return new; end if;
 if TG_OP='UPDATE' then
  if new.dealer_id is not distinct from old.dealer_id then
   return new;
  end if;
 end if;
 select status into dealer_status
 from public.material_pilot_dealers
 where id=new.dealer_id for update;
 if dealer_status is distinct from 'active' then
  raise exception '승인된 활성 대리점에만 배정할 수 있습니다.';
 end if;
 return new;
end $$;

revoke all on function public.material_pilot_dealer_delete_guard()
 from public,anon,authenticated;
revoke all on function public.material_pilot_dealer_assign_guard()
 from public,anon,authenticated;
grant execute on function public.material_pilot_dealer_delete_guard()
 to service_role;
grant execute on function public.material_pilot_dealer_assign_guard()
 to service_role;

drop trigger if exists material_pilot_dealer_delete_guard
 on public.material_pilot_dealers;
create trigger material_pilot_dealer_delete_guard
 before update of status on public.material_pilot_dealers
 for each row execute function public.material_pilot_dealer_delete_guard();

drop trigger if exists material_pilot_dealer_assign_guard
 on public.material_pilot_orders;
create trigger material_pilot_dealer_assign_guard
 before insert or update of dealer_id on public.material_pilot_orders
 for each row execute function public.material_pilot_dealer_assign_guard();
commit;
select '대리점 중지·삭제 설정 완료' as result;
