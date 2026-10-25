-- Fixed immutable operator company identity; no public-selectable free plan.
alter table public.alimtalk_deliveries add column if not exists credit_exempt boolean not null default false;
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
 if p_company<>'2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid and a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient'); end if;
 insert into public.alimtalk_deliveries(id,company_id,site_id,worker_id,kind,recipient_mask,template_code,content_hash,created_by,credit_exempt)
 values(p_id,p_company,p_site,p_worker,p_kind,p_mask,p_template,p_hash,p_actor,p_company='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid);
 update public.alimtalk_accounts set available_count=available_count-case when p_company='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid then 0 else 1 end,updated_at=now() where company_id=p_company;
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
 if not d.credit_exempt and p_status in ('failed','canceled','rejected') then update public.alimtalk_accounts set available_count=available_count+1,updated_at=now() where company_id=c;end if;
 update public.alimtalk_deliveries set status=p_status,receipt_id=coalesce(p_receipt,receipt_id),error_code=left(p_error,80),
 accounting=case when p_status='success' then 'charged' when p_status in ('failed','canceled','rejected') then 'refunded' else 'reserved' end,updated_at=now() where id=p_id;
 return jsonb_build_object('found',true,'status',p_status);
end $$;
revoke all on function public.settle_alimtalk(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.settle_alimtalk(uuid,text,text,text) to service_role;

create or replace function public.reserve_customer_reminder(p_id uuid,p_company uuid,p_site uuid,p_work_date date,p_mask text,p_template text,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.alimtalk_accounts%rowtype; s public.sites%rowtype; first_day date;
begin
 if p_hash is null or length(p_hash)<>64 or p_work_date is null then raise exception 'invalid reminder' using errcode='22023';end if;
 select * into s from public.sites where id=p_site and company_id=p_company for share;
 if not found or s.status not in ('scheduled','in_progress') or not exists(select 1 from public.companies where id=p_company and is_active=true) then return jsonb_build_object('accepted',false,'reason','inactive');end if;
 if s.work_dates is not null then select min(d) into first_day from unnest(s.work_dates) d;
 else first_day:=coalesce((s.schedule_start at time zone 'Asia/Seoul')::date,s.schedule_date);end if;
 if first_day is distinct from p_work_date or p_work_date<>((now() at time zone 'Asia/Seoul')::date+1) then return jsonb_build_object('accepted',false,'reason','stale');end if;
 select * into a from public.alimtalk_accounts where company_id=p_company for update;
 if not found or not a.enabled then return jsonb_build_object('accepted',false,'reason','disabled');end if;
 if exists(select 1 from public.alimtalk_deliveries where id=p_id or (company_id=p_company and site_id=p_site and kind='customer_reminder' and reminder_work_date=p_work_date)) then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 if p_company<>'2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid and a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient');end if;
 insert into public.alimtalk_deliveries(id,company_id,site_id,kind,recipient_mask,template_code,content_hash,reminder_work_date,credit_exempt) values(p_id,p_company,p_site,'customer_reminder',p_mask,p_template,p_hash,p_work_date,p_company='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid);
 update public.alimtalk_accounts set available_count=available_count-case when p_company='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid then 0 else 1 end,updated_at=now() where company_id=p_company;
 return jsonb_build_object('accepted',true);
end;$$;
revoke all on function public.reserve_customer_reminder(uuid,uuid,uuid,date,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_customer_reminder(uuid,uuid,uuid,date,text,text,text) to service_role;

insert into public.alimtalk_accounts(company_id,enabled) values('2ddfe3d9-4411-4991-ae35-5b876be411bc',true) on conflict(company_id) do update set enabled=true,updated_at=now();

-- Prevent future plan UI/scheduler updates from reinstating a charge for this company.
create or replace function public.guard_operator_subscription() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.company_id='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid then
  new.status:='active';new.monthly_price_krw:=0;new.next_billing_at:=null;new.pending_plan_code:=null;new.cancel_at_period_end:=false;new.canceled_at:=null;
  new.current_period_end:='2099-12-31T00:00:00Z';new.next_payment_retry_at:=null;new.payment_retry_count:=0;
 end if;return new;
end;$$;
revoke all on function public.guard_operator_subscription() from public,anon,authenticated;
drop trigger if exists operator_subscription_no_charge on public.subscriptions;
create trigger operator_subscription_no_charge before insert or update on public.subscriptions for each row execute function public.guard_operator_subscription();
update public.subscriptions set monthly_price_krw=0 where company_id='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid;
-- Update existing authenticated usage reporting in place, preserving signatures and access.
do $patch$
declare def text;col text;
begin
 select pg_get_functiondef('public.get_my_plan_usage()'::regprocedure) into def;
 if position('운영자 무제한' in def)=0 then
 foreach col in array array['ai_photo_analysis_limit','auto_estimate_limit','similar_image_search_limit','virtual_remodel_limit','image_upload_limit','storage_mb_limit','customer_lead_limit','monthly_price_krw'] loop
  def:=replace(def,'sp.'||col,format('(case when v_company_id=%L::uuid then 0 else sp.%s end)','2ddfe3d9-4411-4991-ae35-5b876be411bc',col));
 end loop;
 def:=replace(def,'sp.plan_name',format('(case when v_company_id=%L::uuid then %L else sp.plan_name end)','2ddfe3d9-4411-4991-ae35-5b876be411bc','운영자 무제한'));execute def;end if;
 select pg_get_functiondef('public.get_my_subscription()'::regprocedure) into def;
 def:=replace(def,'sp.monthly_price_krw',format('(case when c.id=%L::uuid then 0 else sp.monthly_price_krw end)','2ddfe3d9-4411-4991-ae35-5b876be411bc'));
 def:=replace(def,'sp.plan_name',format('(case when c.id=%L::uuid then %L else sp.plan_name end)','2ddfe3d9-4411-4991-ae35-5b876be411bc','운영자 무제한'));execute def;
 select pg_get_functiondef('public.reserve_commute_quota(uuid,uuid)'::regprocedure) into def;
 def:=replace(def,'if coalesce(v_limit, 0) <= 0 then',format('if p_company_id<>%L::uuid and coalesce(v_limit, 0) <= 0 then','2ddfe3d9-4411-4991-ae35-5b876be411bc'));
 def:=replace(def,'if v_used + 1 > v_limit then',format('if p_company_id<>%L::uuid and v_used + 1 > v_limit then','2ddfe3d9-4411-4991-ae35-5b876be411bc'));execute def;
end;$patch$;
