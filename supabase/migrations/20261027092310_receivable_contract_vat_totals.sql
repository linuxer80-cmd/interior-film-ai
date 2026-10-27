-- Customer contract receivables include the separately displayed 10% VAT.
-- Keep stored supply amounts, payment entries and report-only fallbacks unchanged.
do $$
declare
  amount_type text;
begin
  select format_type(atttypid, atttypmod)
    into amount_type
  from pg_attribute
  where attrelid = 'public.site_receivable_balances'::regclass
    and attname = 'contract_amount' and not attisdropped;

  if amount_type is null then
    raise exception '미수금 집계의 금액 항목을 확인해주세요.';
  end if;

  execute format($view$
    create or replace view public.site_receivable_balances
    with (security_invoker = true) as
    select
      s.id, s.company_id, s.site_name, s.customer_name, s.status,
      cast(b.amount as %s) as contract_amount,
      s.deposit_amount,
      a.opening_paid, a.opening_date, a.due_date,
      coalesce(a.revision, 0) as revision,
      a.site_id is not null as confirmed,
      case when a.site_id is not null
        then a.opening_paid + coalesce(e.net, 0::numeric)
        else null::numeric end as paid,
      case when a.site_id is not null and b.amount is not null
        then greatest(b.amount - a.opening_paid - coalesce(e.net, 0::numeric), 0::numeric)
        else null::numeric end as outstanding,
      case when a.site_id is not null and b.amount is not null
        then greatest(a.opening_paid + coalesce(e.net, 0::numeric) - b.amount, 0::numeric)
        else null::numeric end as overpaid,
      s.contract_amount as original_contract_amount,
      case when s.contract_amount > 0 then 'contract'
        when r.review_status = 'approved' and r.approved_amount >= 0 then 'approved_report'
        else 'missing' end::text as amount_source,
      case when s.contract_amount > 0 then s.contract_amount else null::numeric end as supply_amount,
      case when s.contract_amount > 0 then round(s.contract_amount * 0.1) else null::numeric end as vat_amount
    from public.sites s
    left join public.site_payment_accounts a
      on a.site_id = s.id and a.company_id = s.company_id
    left join lateral (
      select w.review_status, w.approved_amount
      from public.work_reports w
      where w.site_id = s.id and w.company_id = s.company_id
      order by w.updated_at desc, w.id asc
      limit 1
    ) r on true
    cross join lateral (
      select case
        when s.contract_amount > 0 then s.contract_amount + round(s.contract_amount * 0.1)
        when r.review_status = 'approved' and r.approved_amount >= 0
          then r.approved_amount
        else null::numeric
      end as amount
    ) b
    left join lateral (
      select sum(case when p.direction = 'payment' then p.amount else -p.amount end) as net
      from public.site_payment_entries p
      where p.site_id = s.id and p.company_id = s.company_id
        and p.voided_at is null
    ) e on true
  $view$, amount_type);
end $$;
