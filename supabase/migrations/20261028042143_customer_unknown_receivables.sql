-- Extend the existing service-only lookup with completed sites whose payment
-- or amount needs confirmation. Unknown balances must never be treated as zero.
create or replace function public.customer_trade_receivables(p_company uuid,p_site uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 with current_client as (
   select c.id,c.name from public.trade_site_links l
   join public.trade_clients c on c.id=l.client_id and c.company_id=l.company_id
   join public.sites s on s.id=l.site_id and s.company_id=l.company_id
   where l.site_id=p_site and l.company_id=p_company
 ), previous as (
   select b.*,s.schedule_date from public.trade_site_links l
   join current_client c on c.id=l.client_id
   join public.site_receivable_balances b on b.id=l.site_id and b.company_id=l.company_id
   join public.sites s on s.id=b.id and s.company_id=b.company_id
   where l.company_id=p_company and l.site_id<>p_site and b.status='completed'
 ), unpaid as (
   select * from previous where confirmed and contract_amount is not null and outstanding>0
 ), unknown as (
   select * from previous where not confirmed or contract_amount is null
 )
 select jsonb_build_object(
   'clientName',c.name,
   'previousTotal',coalesce((select sum(outstanding) from unpaid),0),
   'count',(select count(*) from unpaid),
   'unknownCount',(select count(*) from unknown),
   'items',coalesce((select jsonb_agg(jsonb_build_object(
     'siteName',site_name,'supplyAmount',supply_amount,'vatAmount',vat_amount,
     'totalAmount',contract_amount,'paid',paid,'outstanding',outstanding
   ) order by site_name,id) from unpaid),'[]'::jsonb),
   'unknownItems',coalesce((select jsonb_agg(jsonb_build_object(
     'siteName',site_name,'scheduleDate',schedule_date,'supplyAmount',supply_amount,
     'vatAmount',vat_amount,'totalAmount',contract_amount,'paid',paid,'outstanding',outstanding
   ) order by site_name,id) from unknown),'[]'::jsonb)
 ) from current_client c;
$$;
revoke all on function public.customer_trade_receivables(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_trade_receivables(uuid,uuid) to service_role;
