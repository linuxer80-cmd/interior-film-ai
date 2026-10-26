-- Local search credentials stay service-only under the existing company restriction/RLS.
begin;
alter table public.online_sales_connections drop constraint online_sales_connections_platform_check;
alter table public.online_sales_connections add constraint online_sales_connections_platform_check check (platform in ('daangn','naver','naver_place'));
insert into public.online_sales_connections(company_id,platform)
values ('2ddfe3d9-4411-4991-ae35-5b876be411bc','naver_place') on conflict do nothing;
commit;
