create table public.standalone_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  created_by uuid not null,
  area_document jsonb,
  area_revision integer not null default 0 check (area_revision >= 0),
  cost_document jsonb,
  cost_revision integer not null default 0 check (cost_revision >= 0),
  linked_site_id uuid references public.sites(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index standalone_quotes_company_updated on public.standalone_quotes(company_id, updated_at desc);
alter table public.standalone_quotes enable row level security;
revoke all on public.standalone_quotes from public, anon, authenticated;
grant all on public.standalone_quotes to service_role;

-- Only the server's service role may call this transaction. The API validates
-- the owner's identity and company before passing the scoped arguments.
create function public.link_standalone_quote(p_quote uuid, p_site uuid, p_company uuid, p_user uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare q public.standalone_quotes%rowtype;
begin
  select * into q from public.standalone_quotes where id=p_quote and company_id=p_company for update;
  if not found then raise exception '견적서를 찾을 수 없습니다.' using errcode='P0002'; end if;
  if q.linked_site_id is not null then raise exception '이미 현장에 연결된 견적서입니다.' using errcode='23505'; end if;
  if not exists(select 1 from public.sites where id=p_site and company_id=p_company and status is distinct from 'cancelled') then raise exception '현장을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if q.area_document is null and q.cost_document is null then raise exception '견적서를 저장한 후 연결해주세요.' using errcode='22023'; end if;
  if q.area_document is not null then
    insert into public.site_consultation_quotes(site_id,company_id,document,revision,updated_at)
      values(p_site,p_company,q.area_document,1,now());
  end if;
  if q.cost_document is not null then
    insert into public.site_completion_estimates(site_id,company_id,document,revision,updated_at,updated_by)
      values(p_site,p_company,q.cost_document,1,now(),p_user);
  end if;
  update public.standalone_quotes set linked_site_id=p_site,updated_at=now() where id=p_quote;
  return p_site;
end $$;
revoke all on function public.link_standalone_quote(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.link_standalone_quote(uuid,uuid,uuid,uuid) to service_role;
