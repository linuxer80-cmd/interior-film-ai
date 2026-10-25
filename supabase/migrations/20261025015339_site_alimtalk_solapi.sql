-- Existing count-based prepaid accounts are preserved; a new account stays disabled.
create table if not exists public.alimtalk_accounts (
 company_id uuid primary key references public.companies(id),enabled boolean not null default false,
 available_count integer not null default 0 check(available_count>=0),updated_at timestamptz not null default now()
);
create table if not exists public.alimtalk_credit_entries (
 id uuid primary key,company_id uuid not null references public.companies(id),quantity integer not null,
 reason text not null,actor_id uuid not null,created_at timestamptz not null default now()
);
create table if not exists public.alimtalk_deliveries (
 id uuid primary key,company_id uuid not null references public.companies(id),notification_id uuid unique references public.notifications(id) on delete set null,
 kind text not null,recipient_mask text not null,template_code text not null,receipt_id text unique,
 status text not null default 'reserved' check(status in ('reserved','requested','unknown','success','failed','canceled','rejected')),
 accounting text not null default 'reserved' check(accounting in ('reserved','charged','refunded')),
 error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.alimtalk_deliveries add column if not exists site_id uuid references public.sites(id);
alter table public.alimtalk_deliveries add column if not exists worker_id uuid references public.workers(id);
alter table public.alimtalk_deliveries add column if not exists content_hash text;
alter table public.alimtalk_deliveries add column if not exists created_by uuid;
create index if not exists alimtalk_site_history on public.alimtalk_deliveries(company_id,site_id,created_at desc,id desc);
alter table public.alimtalk_accounts enable row level security;
alter table public.alimtalk_credit_entries enable row level security;
alter table public.alimtalk_deliveries enable row level security;
revoke all on public.alimtalk_accounts,public.alimtalk_credit_entries,public.alimtalk_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.alimtalk_accounts,public.alimtalk_credit_entries,public.alimtalk_deliveries to service_role;

create or replace function public.reserve_site_alimtalk(
 p_id uuid,p_company uuid,p_site uuid,p_actor uuid,p_worker uuid,p_kind text,p_mask text,p_template text,p_hash text,p_expected uuid,p_resend boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.alimtalk_accounts%rowtype; last_send public.alimtalk_deliveries%rowtype;
begin
 if p_kind not in ('customer_schedule','site_assigned') or p_hash !~ '^[a-f0-9]{64}$' or p_mask is null or p_template is null then raise exception 'invalid delivery'; end if;
 if not exists(select 1 from public.profiles where id=p_actor and company_id=p_company and role='owner' and is_active=true)
 or not exists(select 1 from public.companies where id=p_company and is_active=true)
 or not exists(select 1 from public.sites where id=p_site and company_id=p_company and status not in ('completed','cancelled','canceled')) then raise exception 'forbidden' using errcode='42501'; end if;
 if (p_kind='site_assigned' and (p_worker is null or not exists(select 1 from public.workers where id=p_worker and company_id=p_company and is_active=true)))
 or (p_kind='customer_schedule' and p_worker is not null) then raise exception 'worker mismatch' using errcode='42501'; end if;
 select * into a from public.alimtalk_accounts where company_id=p_company for update;
 if not found or not a.enabled then return jsonb_build_object('accepted',false,'reason','disabled'); end if;
 if exists(select 1 from public.alimtalk_deliveries where id=p_id) then return jsonb_build_object('accepted',false,'reason','duplicate'); end if;
 select * into last_send from public.alimtalk_deliveries where company_id=p_company and site_id=p_site and kind=p_kind and worker_id is not distinct from p_worker
 order by created_at desc,id desc limit 1;
 if last_send.id is not null and last_send.accounting='reserved' then return jsonb_build_object('accepted',false,'reason','pending'); end if;
 if p_kind='customer_schedule' and (last_send.id is distinct from p_expected or (last_send.id is not null and not p_resend)) then return jsonb_build_object('accepted',false,'reason','stale'); end if;
 if p_kind='site_assigned' and exists(select 1 from public.alimtalk_deliveries where company_id=p_company and site_id=p_site and worker_id=p_worker and kind=p_kind and content_hash=p_hash) then return jsonb_build_object('accepted',false,'reason','duplicate'); end if;
 if a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient'); end if;
 insert into public.alimtalk_deliveries(id,company_id,site_id,worker_id,kind,recipient_mask,template_code,content_hash,created_by)
 values(p_id,p_company,p_site,p_worker,p_kind,p_mask,p_template,p_hash,p_actor);
 update public.alimtalk_accounts set available_count=available_count-1,updated_at=now() where company_id=p_company;
 return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.reserve_site_alimtalk(uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_site_alimtalk(uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid,boolean) to service_role;

-- Keep the established reservation/settlement semantics, including exactly-once refunds.
create or replace function public.settle_alimtalk(p_id uuid,p_status text,p_receipt text default null,p_error text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.alimtalk_deliveries%rowtype;c uuid;
begin
 if p_status not in ('requested','unknown','success','failed','canceled','rejected') then raise exception 'invalid status';end if;
 select company_id into c from public.alimtalk_deliveries where id=p_id;
 if not found then return jsonb_build_object('found',false);end if;
 perform 1 from public.alimtalk_accounts where company_id=c for update;
 select * into d from public.alimtalk_deliveries where id=p_id for update;
 if d.receipt_id is not null and p_receipt is not null and d.receipt_id<>p_receipt then raise exception 'receipt mismatch';end if;
 if d.accounting<>'reserved' then return jsonb_build_object('found',true,'status',d.status);end if;
 if p_status in ('failed','canceled','rejected') then update public.alimtalk_accounts set available_count=available_count+1,updated_at=now() where company_id=c;end if;
 update public.alimtalk_deliveries set status=p_status,receipt_id=coalesce(p_receipt,receipt_id),error_code=left(p_error,80),
 accounting=case when p_status='success' then 'charged' when p_status in ('failed','canceled','rejected') then 'refunded' else 'reserved' end,updated_at=now() where id=p_id;
 return jsonb_build_object('found',true,'status',p_status);
end $$;
revoke all on function public.settle_alimtalk(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.settle_alimtalk(uuid,text,text,text) to service_role;

create or replace function public.grant_alimtalk_credits(p_id uuid,p_company uuid,p_quantity integer,p_reason text,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_quantity is null or p_quantity<1 or p_quantity>1000000 or p_reason is null or length(trim(p_reason))<3 then raise exception 'invalid grant';end if;
 if not exists(select 1 from public.super_admins where user_id=p_actor and is_active=true) then raise exception 'forbidden' using errcode='42501';end if;
 insert into public.alimtalk_accounts(company_id) values(p_company) on conflict do nothing;
 perform 1 from public.alimtalk_accounts where company_id=p_company for update;
 if exists(select 1 from public.alimtalk_credit_entries where id=p_id) then return jsonb_build_object('duplicate',true);end if;
 insert into public.alimtalk_credit_entries(id,company_id,quantity,reason,actor_id) values(p_id,p_company,p_quantity,left(p_reason,500),p_actor);
 update public.alimtalk_accounts set available_count=available_count+p_quantity,updated_at=now() where company_id=p_company returning available_count into n;
 return jsonb_build_object('available_count',n);
end $$;
revoke all on function public.grant_alimtalk_credits(uuid,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.grant_alimtalk_credits(uuid,uuid,integer,text,uuid) to service_role;

create or replace function public.set_alimtalk_enabled(p_company uuid,p_actor uuid,p_enabled boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_enabled is null or not exists(select 1 from public.super_admins where user_id=p_actor and is_active=true) then raise exception 'forbidden' using errcode='42501';end if;
 insert into public.alimtalk_accounts(company_id) values(p_company) on conflict do nothing;
 update public.alimtalk_accounts set enabled=p_enabled,updated_at=now() where company_id=p_company;
end $$;
revoke all on function public.set_alimtalk_enabled(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_alimtalk_enabled(uuid,uuid,boolean) to service_role;
