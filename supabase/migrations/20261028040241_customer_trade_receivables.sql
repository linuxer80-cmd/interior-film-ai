-- Called only by the server after resolving the site's private customer link.
-- Return billing fields only; no contacts, addresses, tokens, costs or other companies.
create or replace function public.customer_trade_receivables(p_company uuid,p_site uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 with current_client as (
   select c.id,c.name from public.trade_site_links l
   join public.trade_clients c on c.id=l.client_id and c.company_id=l.company_id
   join public.sites s on s.id=l.site_id and s.company_id=l.company_id
   where l.site_id=p_site and l.company_id=p_company
 ), previous as (
   select b.* from public.trade_site_links l
   join current_client c on c.id=l.client_id
   join public.site_receivable_balances b on b.id=l.site_id and b.company_id=l.company_id
   where l.company_id=p_company and l.site_id<>p_site and b.status='completed'
 ), unpaid as (
   select * from previous where confirmed and contract_amount is not null and outstanding>0
 )
 select jsonb_build_object(
   'clientName',c.name,
   'previousTotal',coalesce((select sum(outstanding) from unpaid),0),
   'count',(select count(*) from unpaid),
   'unknownCount',(select count(*) from previous where not confirmed or contract_amount is null),
   'items',coalesce((select jsonb_agg(jsonb_build_object(
     'siteName',site_name,'supplyAmount',supply_amount,'vatAmount',vat_amount,
     'totalAmount',contract_amount,'paid',paid,'outstanding',outstanding
   ) order by site_name,id) from unpaid),'[]'::jsonb)
 ) from current_client c;
$$;
revoke all on function public.customer_trade_receivables(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_trade_receivables(uuid,uuid) to service_role;
