-- Private capability links: only server service role can access these rows.
create table if not exists public.customer_site_portals (
 site_id uuid primary key references public.sites(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 token_id uuid not null unique default gen_random_uuid(),
 expires_at timestamptz not null default (now()+interval '30 days'),
 used integer not null default 0 check(used between 0 and 3)
);
create index if not exists customer_site_portals_company_idx on public.customer_site_portals(company_id);
alter table public.customer_site_portals enable row level security;
revoke all on public.customer_site_portals from anon, authenticated;
grant select,insert,update,delete on public.customer_site_portals to service_role;
create or replace function public.reserve_customer_portal(p_token uuid,p_company uuid)
returns integer language sql security invoker set search_path=public as $$
 update public.customer_site_portals p set used=used+1
 where token_id=p_token and company_id=p_company and used<3 and expires_at>now()
 and exists(select 1 from public.sites s join public.companies c on c.id=s.company_id where s.id=p.site_id and s.company_id=p_company and s.status<>'cancelled' and c.is_active)
 returning used;
$$;
revoke all on function public.reserve_customer_portal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_customer_portal(uuid,uuid) to service_role;
alter table public.company_public_profiles add column if not exists instagram_url text not null default '';
