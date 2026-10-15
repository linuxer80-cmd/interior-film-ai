-- Server-only delivery ledger. Apply once; no customer balances are seeded.
create table if not exists public.alimtalk_accounts (
 company_id uuid primary key references public.companies(id),
 enabled boolean not null default false,
 available_count integer not null default 0 check(available_count>=0),
 updated_at timestamptz not null default now()
);
create table if not exists public.alimtalk_deliveries (
 id uuid primary key,
 company_id uuid not null references public.companies(id),
 notification_id uuid unique references public.notifications(id) on delete set null,
 kind text not null,
 recipient_mask text not null,
 template_code text not null,
 receipt_id text unique,
 status text not null default 'reserved' check(status in ('reserved','requested','unknown','success','failed','canceled','rejected')),
 accounting text not null default 'reserved' check(accounting in ('reserved','charged','refunded')),
 error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists alimtalk_deliveries_company_created on public.alimtalk_deliveries(company_id,created_at desc);
create table if not exists public.alimtalk_credit_entries (
 id uuid primary key,
 company_id uuid not null references public.companies(id),
 quantity integer not null check(quantity>0),
 reason text not null,
 actor_id uuid not null,
 created_at timestamptz not null default now()
);
create index if not exists alimtalk_credit_entries_company_created on public.alimtalk_credit_entries(company_id,created_at desc);
alter table public.alimtalk_accounts enable row level security;
alter table public.alimtalk_deliveries enable row level security;
alter table public.alimtalk_credit_entries enable row level security;
revoke all on public.alimtalk_accounts,public.alimtalk_deliveries,public.alimtalk_credit_entries from public,anon,authenticated;
grant select,insert,update,delete on public.alimtalk_accounts,public.alimtalk_deliveries,public.alimtalk_credit_entries to service_role;

create or replace function public.reserve_alimtalk(p_id uuid,p_company uuid,p_notification uuid,p_kind text,p_mask text,p_template text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.alimtalk_accounts%rowtype; d public.alimtalk_deliveries%rowtype;
begin
 select * into a from public.alimtalk_accounts where company_id=p_company for update;
 if not found then return jsonb_build_object('accepted',false,'reason','disabled'); end if;
 select * into d from public.alimtalk_deliveries where id=p_id or (p_notification is not null and notification_id=p_notification);
 if found then return jsonb_build_object('accepted',false,'reason','duplicate','status',d.status); end if;
 if not a.enabled then return jsonb_build_object('accepted',false,'reason','disabled'); end if;
 if a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient'); end if;
 if not exists(select 1 from public.companies where id=p_company and is_active=true) then return jsonb_build_object('accepted',false,'reason','inactive'); end if;
 if p_notification is not null and not exists(select 1 from public.notifications where id=p_notification and company_id=p_company) then raise exception 'notification mismatch'; end if;
 insert into public.alimtalk_deliveries(id,company_id,notification_id,kind,recipient_mask,template_code) values(p_id,p_company,p_notification,p_kind,p_mask,p_template);
 update public.alimtalk_accounts set available_count=available_count-1,updated_at=now() where company_id=p_company;
 return jsonb_build_object('accepted',true);
end $$;
create or replace function public.settle_alimtalk(p_id uuid,p_status text,p_receipt text default null,p_error text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.alimtalk_deliveries%rowtype; c uuid;
begin
 if p_status not in ('requested','unknown','success','failed','canceled','rejected') then raise exception 'invalid status'; end if;
 select company_id into c from public.alimtalk_deliveries where id=p_id;
 if not found then return jsonb_build_object('found',false); end if;
 -- Same lock order as reserve/grant avoids deadlocks.
 perform 1 from public.alimtalk_accounts where company_id=c for update;
 select * into d from public.alimtalk_deliveries where id=p_id for update;
 if d.receipt_id is not null and p_receipt is not null and d.receipt_id<>p_receipt then raise exception 'receipt mismatch'; end if;
 if d.accounting<>'reserved' then return jsonb_build_object('found',true,'status',d.status); end if;
 if p_status in ('failed','canceled','rejected') then
  update public.alimtalk_accounts set available_count=available_count+1,updated_at=now() where company_id=c;
 end if;
 update public.alimtalk_deliveries set status=p_status, receipt_id=coalesce(p_receipt,receipt_id),error_code=left(p_error,80),
 accounting=case when p_status='success' then 'charged' when p_status in ('failed','canceled','rejected') then 'refunded' else 'reserved' end,updated_at=now() where id=p_id;
 return jsonb_build_object('found',true,'status',p_status);
end $$;
create or replace function public.grant_alimtalk_credits(p_id uuid,p_company uuid,p_quantity integer,p_reason text,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_quantity<1 or p_quantity>1000000 or length(trim(p_reason))<3 then raise exception 'invalid grant'; end if;
 if not exists(select 1 from public.super_admins where user_id=p_actor and is_active=true) then raise exception 'forbidden'; end if;
 insert into public.alimtalk_accounts(company_id) values(p_company) on conflict do nothing;
 perform 1 from public.alimtalk_accounts where company_id=p_company for update;
 if exists(select 1 from public.alimtalk_credit_entries where id=p_id) then return jsonb_build_object('duplicate',true); end if;
 insert into public.alimtalk_credit_entries values(p_id,p_company,p_quantity,left(p_reason,500),p_actor,now());
 update public.alimtalk_accounts set available_count=available_count+p_quantity,updated_at=now() where company_id=p_company returning available_count into n;
 return jsonb_build_object('available_count',n);
end $$;
revoke all on function public.reserve_alimtalk(uuid,uuid,uuid,text,text,text),public.settle_alimtalk(uuid,text,text,text),public.grant_alimtalk_credits(uuid,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_alimtalk(uuid,uuid,uuid,text,text,text),public.settle_alimtalk(uuid,text,text,text),public.grant_alimtalk_credits(uuid,uuid,integer,text,uuid) to service_role;
