-- Team-leader allowance belongs to a company, independent of personal wages.
-- Legacy worker allowance columns remain for compatibility; new calculations
-- read only company allowance history. Existing allowances were verified zero.
create table public.company_leader_allowances (
  company_id uuid primary key references public.companies(id) on delete cascade,
  amount numeric not null default 0 check (amount between 0 and 100000000 and amount=trunc(amount)),
  effective_from date not null default ((now() at time zone 'Asia/Seoul')::date),
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
create table public.company_leader_allowance_rates (
  company_id uuid not null references public.companies(id) on delete cascade,
  effective_from date not null,
  amount numeric not null check (amount between 0 and 100000000 and amount=trunc(amount)),
  updated_at timestamptz not null default now(),
  primary key (company_id,effective_from)
);
alter table public.company_leader_allowances enable row level security;
alter table public.company_leader_allowance_rates enable row level security;
revoke all on public.company_leader_allowances, public.company_leader_allowance_rates from anon, authenticated;
grant select on public.company_leader_allowances, public.company_leader_allowance_rates to authenticated;
grant all on public.company_leader_allowances, public.company_leader_allowance_rates to service_role;
create policy company_leader_allowances_owner_read on public.company_leader_allowances for select to authenticated
  using (company_id = (select m.company_id from public.get_my_company() m where m.role='owner' and m.is_active=true));
create policy company_leader_allowance_rates_owner_read on public.company_leader_allowance_rates for select to authenticated
  using (company_id = (select m.company_id from public.get_my_company() m where m.role='owner' and m.is_active=true));

create function public.validate_company_leader_allowance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.effective_from<old.effective_from then
      raise exception '적용일은 이전 팀장비용 적용일 이후로 지정해주세요.';
    end if;
    new.version:=old.version+1;
  end if;
  if new.effective_from>(now() at time zone 'Asia/Seoul')::date then
    raise exception '미래 날짜에는 팀장비용을 적용할 수 없습니다.';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;
create function public.save_company_leader_allowance_rate() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.company_leader_allowance_rates(company_id,effective_from,amount)
  values(new.company_id,new.effective_from,new.amount)
  on conflict(company_id,effective_from) do update set amount=excluded.amount,updated_at=now();
  return new;
end;
$$;
revoke all on function public.validate_company_leader_allowance(), public.save_company_leader_allowance_rate() from public;
grant execute on function public.validate_company_leader_allowance(), public.save_company_leader_allowance_rate() to service_role;
create trigger company_leader_allowances_validate before insert or update on public.company_leader_allowances
  for each row execute function public.validate_company_leader_allowance();
create trigger company_leader_allowances_save after insert or update on public.company_leader_allowances
  for each row execute function public.save_company_leader_allowance_rate();

insert into public.company_leader_allowances(company_id,amount,effective_from)
select id,0,date '1900-01-01' from public.companies;
