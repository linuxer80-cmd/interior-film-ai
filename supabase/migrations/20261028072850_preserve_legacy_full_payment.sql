-- Preserve explicitly completed payments recorded before VAT was added to
-- the receivables view. Do not manufacture payments or infer tax treatment.
do $$
declare amount_type text;
begin
 select format_type(atttypid,atttypmod) into amount_type from pg_attribute
 where attrelid='public.site_receivable_balances'::regclass and attname='contract_amount' and not attisdropped;
 if amount_type is null then raise exception '미수금 금액 항목을 확인해주세요.'; end if;
 execute format($view$
  create or replace view public.site_receivable_balances with (security_invoker=true) as
  select s.id,s.company_id,s.site_name,s.customer_name,s.status,
   cast(b.amount as %s) as contract_amount,s.deposit_amount,a.opening_paid,a.opening_date,a.due_date,
   coalesce(a.revision,0) as revision,a.site_id is not null as confirmed,
   case when a.site_id is not null then a.opening_paid+coalesce(e.net,0::numeric) else null::numeric end as paid,
   case when a.site_id is not null and b.amount is not null then greatest(b.amount-a.opening_paid-coalesce(e.net,0::numeric),0::numeric) else null::numeric end as outstanding,
   case when a.site_id is not null and b.amount is not null then greatest(a.opening_paid+coalesce(e.net,0::numeric)-b.amount,0::numeric) else null::numeric end as overpaid,
   s.contract_amount as original_contract_amount,
   case when s.contract_amount>0 then 'contract' when r.review_status='approved' and r.approved_amount>0 then 'approved_report' else 'missing' end::text as amount_source,
   base.amount as supply_amount,
   case when legacy.is_legacy then null::numeric when base.amount is not null then round(base.amount*0.1) else null::numeric end as vat_amount,
   legacy.is_legacy as legacy_payment_complete
  from public.sites s
  left join public.site_payment_accounts a on a.site_id=s.id and a.company_id=s.company_id
  left join lateral (select w.review_status,w.approved_amount from public.work_reports w where w.site_id=s.id and w.company_id=s.company_id order by w.updated_at desc,w.id asc limit 1) r on true
  left join lateral (select sum(case when p.direction='payment' then p.amount else -p.amount end) as net from public.site_payment_entries p where p.site_id=s.id and p.company_id=s.company_id and p.voided_at is null) e on true
  left join lateral (select p.memo,p.direction,p.created_at from public.site_payment_entries p where p.site_id=s.id and p.company_id=s.company_id and p.voided_at is null order by p.created_at desc,p.id desc limit 1) last_payment on true
  cross join lateral (select case when s.contract_amount>0 then s.contract_amount when r.review_status='approved' and r.approved_amount>0 then r.approved_amount else null::numeric end as amount) base
  cross join lateral (select coalesce(a.site_id is not null and base.amount>0 and a.opening_paid+coalesce(e.net,0)=base.amount and last_payment.direction='payment' and last_payment.memo in ('전액입금 처리','미수금 전액 입금') and last_payment.created_at<'2026-10-27 09:23:10+00'::timestamptz,false) as is_legacy) legacy
  cross join lateral (select case when base.amount is null then null::numeric when legacy.is_legacy then base.amount else base.amount+round(base.amount*0.1) end as amount) b
 $view$,amount_type);
end $$;
