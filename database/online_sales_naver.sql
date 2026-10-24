-- Extend first-party service-only connections without granting any browser access.
alter table public.online_sales_connections drop constraint online_sales_connections_platform_check;
alter table public.online_sales_connections add constraint online_sales_connections_platform_check check (platform in ('daangn','naver'));
insert into public.online_sales_connections(company_id,platform)
values ('2ddfe3d9-4411-4991-ae35-5b876be411bc','naver') on conflict do nothing;
