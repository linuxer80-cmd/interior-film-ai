-- profiles is not directly readable by authenticated clients. Reuse the
-- existing auth.uid()-scoped membership function rather than opening profiles.
alter policy worker_pay_rates_select on public.worker_pay_rates
  using (company_id = (select membership.company_id from public.get_my_company() membership where membership.role = 'owner' and membership.is_active = true));
alter policy worker_pay_rates_insert on public.worker_pay_rates
  with check (company_id = (select membership.company_id from public.get_my_company() membership where membership.role = 'owner' and membership.is_active = true));
alter policy worker_pay_rates_update on public.worker_pay_rates
  using (company_id = (select membership.company_id from public.get_my_company() membership where membership.role = 'owner' and membership.is_active = true))
  with check (company_id = (select membership.company_id from public.get_my_company() membership where membership.role = 'owner' and membership.is_active = true));
