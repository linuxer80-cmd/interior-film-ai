-- First-party marketing only. No browser/Data API role can read credentials.
create table if not exists public.online_sales_connections (
 company_id uuid not null references public.companies(id),
 platform text not null check (platform = 'daangn'),
 advertiser_id text,
 api_key_ciphertext text,
 snapshot jsonb,
 last_synced_at timestamptz,
 last_error text,
 lock_token uuid,
 locked_until timestamptz not null default '-infinity',
 primary key (company_id, platform),
 check (company_id = '2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid),
 check ((advertiser_id is null) = (api_key_ciphertext is null))
);
alter table public.online_sales_connections enable row level security;
drop policy if exists online_sales_deny_browser on public.online_sales_connections;
create policy online_sales_deny_browser on public.online_sales_connections for all to anon, authenticated using (false) with check (false);
revoke all on public.online_sales_connections from public, anon, authenticated;
grant select, insert, update, delete on public.online_sales_connections to service_role;
insert into public.online_sales_connections(company_id,platform)
values ('2ddfe3d9-4411-4991-ae35-5b876be411bc','daangn') on conflict do nothing;
