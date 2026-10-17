begin;
create table if not exists public.material_pilot_notifications (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.material_pilot_orders(id),
 user_id uuid not null references auth.users(id),
 revision integer not null,
 title text not null, message text not null, link text not null,
 push_sent_at timestamptz, created_at timestamptz not null default now(),
 unique(order_id,user_id,revision)
);
alter table public.material_pilot_notifications enable row level security;
revoke all on public.material_pilot_notifications from public,anon,authenticated;
grant select,insert,update,delete on public.material_pilot_notifications to service_role;
create index if not exists material_pilot_notice_user on public.material_pilot_notifications(user_id,created_at desc);
create or replace function public.material_pilot_commit(p_order uuid,p_revision integer,p_actor uuid,p_request uuid,p_action text,p_hash text,p_next jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare o public.material_pilot_orders%rowtype; e public.material_pilot_events%rowtype;
begin
 select * into o from public.material_pilot_orders where id=p_order for update;
 if not found then raise exception '주문을 찾을 수 없습니다.' using errcode='22023'; end if;
 select * into e from public.material_pilot_events where id=p_request;
 if found then
  if e.order_id<>p_order or e.actor_id<>p_actor or e.request_hash<>p_hash or e.action<>p_action then
   raise exception '이미 사용된 요청 번호입니다.' using errcode='22023';
  end if;
  return to_jsonb(o);
 end if;
 if o.revision is distinct from p_revision then raise exception '주문이 변경되었습니다. 새로고침해주세요.' using errcode='40001'; end if;
 update public.material_pilot_orders set status=p_next->>'status',dealer_id=(p_next->>'dealer_id')::uuid,
 items=coalesce(p_next->'items',items),shipping=coalesce(p_next->'shipping',shipping),
 supply_prices=p_next->'supply_prices',shipments=p_next->'shipments',revision=revision+1 where id=p_order returning * into o;
 insert into public.material_pilot_events(id,order_id,actor_id,action,request_hash) values(p_request,p_order,p_actor,p_action,p_hash);
 return to_jsonb(o);
end $$;
revoke all on function public.material_pilot_commit(uuid,integer,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.material_pilot_commit(uuid,integer,uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.material_pilot_notice()
returns trigger language plpgsql set search_path='' as $$
declare target uuid; title_text text; href text; o public.material_pilot_orders%rowtype;
begin
 if TG_TABLE_NAME='material_pilot_orders' then
  for target in select user_id from public.super_admins where is_active=true loop
   insert into public.material_pilot_notifications(order_id,user_id,revision,title,message,link)
   values(new.id,target,0,'테스트 자재 주문 접수','공급 대리점을 배정해주세요.','/super-admin/material-pilot?order='||new.id)
   on conflict do nothing;
  end loop;
 else
  select * into o from public.material_pilot_orders where id=new.order_id;
  title_text:=case new.action when 'edit' then '자재 주문 변경 · 재확인 요청'
   when 'assign' then '자재 발주 배정' when 'accept' then '자재 주문 확인'
   when 'ready' then '자재 준비 완료 · 테스트 결제 요청'
   when 'test_pay' then '테스트 결제 확인 · 발송 준비'
   when 'ship' then '자재 발송·수령 안내' when 'receive' then '자재 수령 완료'
   when 'cancel' then '자재 주문 취소' else '자재 주문 상태 변경' end;
  if new.action in ('assign','edit','test_pay','receive','cancel') then
   select user_id into target from public.material_pilot_dealers where id=o.dealer_id;
   href:='/dealer?order='||o.id;
  else
   target:=o.buyer_id;href:='/admin/material-order?order='||o.id;
  end if;
  if target is not null then
   insert into public.material_pilot_notifications(order_id,user_id,revision,title,message,link)
   values(o.id,target,o.revision,title_text,'주문 내용을 확인해주세요. TEST-'||upper(left(o.id::text,8)),href)
   on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.material_pilot_notice() from public,anon,authenticated;
grant execute on function public.material_pilot_notice() to service_role;
drop trigger if exists material_pilot_new_notice on public.material_pilot_orders;
create trigger material_pilot_new_notice after insert on public.material_pilot_orders
for each row execute function public.material_pilot_notice();
drop trigger if exists material_pilot_event_notice on public.material_pilot_events;
create trigger material_pilot_event_notice after insert on public.material_pilot_events
for each row execute function public.material_pilot_notice();
commit;
select '자재 수령 방식·준비 후 테스트 결제·알림 설정 완료' as result;
