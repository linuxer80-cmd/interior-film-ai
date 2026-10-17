begin;
-- Test-only storage: never charges a card or writes production inventory.
create table if not exists public.material_pilot_companies (
 company_id uuid primary key references public.companies(id), enabled boolean not null default true
);
create table if not exists public.material_pilot_dealers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id),
 name text not null check(length(name) between 1 and 80),
 status text not null default 'pending' check(status in ('pending','active','disabled')),
 created_at timestamptz not null default now()
);
create table if not exists public.material_pilot_orders (
 id uuid primary key, company_id uuid not null references public.companies(id),
 buyer_id uuid not null references auth.users(id), request_hash text not null,
 dealer_id uuid references public.material_pilot_dealers(id),
 status text not null default 'requested' check(status in ('requested','assigned','preparing','partial','shipped','received','cancelled')),
 items jsonb not null check(jsonb_typeof(items)='array'), shipping jsonb not null,
 supply_prices jsonb not null default '[]', shipments jsonb not null default '[]',
 revision integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.material_pilot_events (
 id uuid primary key, order_id uuid not null references public.material_pilot_orders(id),
 actor_id uuid not null references auth.users(id), action text not null, request_hash text not null,
 created_at timestamptz not null default now()
);
create index if not exists material_pilot_orders_company on public.material_pilot_orders(company_id,created_at desc);
create index if not exists material_pilot_orders_dealer on public.material_pilot_orders(dealer_id,created_at desc);
create index if not exists material_pilot_events_order on public.material_pilot_events(order_id,created_at);
alter table public.material_pilot_companies enable row level security;
alter table public.material_pilot_dealers enable row level security;
alter table public.material_pilot_orders enable row level security;
alter table public.material_pilot_events enable row level security;
revoke all on public.material_pilot_companies,public.material_pilot_dealers,public.material_pilot_orders,public.material_pilot_events from public,anon,authenticated;
grant select,insert,update,delete on public.material_pilot_companies,public.material_pilot_dealers,public.material_pilot_orders,public.material_pilot_events to service_role;
-- API verifies actor and role. Service-only CAS + event insert are one transaction.
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
 supply_prices=p_next->'supply_prices',shipments=p_next->'shipments',revision=revision+1 where id=p_order returning * into o;
 insert into public.material_pilot_events(id,order_id,actor_id,action,request_hash) values(p_request,p_order,p_actor,p_action,p_hash);
 return to_jsonb(o);
end $$;
revoke all on function public.material_pilot_commit(uuid,integer,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.material_pilot_commit(uuid,integer,uuid,uuid,text,text,jsonb) to service_role;
-- Bootstrap only the existing verified test owner's company; company names cannot grant access.
insert into public.material_pilot_companies(company_id)
select p.company_id from public.profiles p join auth.users u on u.id=p.id join public.companies c on c.id=p.company_id
where lower(u.email)='linuxer80@gmail.com' and u.email_confirmed_at is not null
 and p.role='owner' and p.is_active is distinct from false and c.is_active=true
on conflict(company_id) do nothing;
commit;
select '대리점 테스트 설정 완료' as result,count(*) as 테스트업체수 from public.material_pilot_companies where enabled;
