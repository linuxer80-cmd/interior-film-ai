-- Existing pay settings are the only known historical baseline. Existing
-- leader allowances start at zero; no previously stored wage is changed.
alter table public.workers
  add column leader_allowance numeric not null default 0,
  add column pay_rate_effective_from date not null default date '1900-01-01',
  add constraint workers_leader_allowance_check check (leader_allowance between 0 and 100000000 and leader_allowance = trunc(leader_allowance)),
  add constraint workers_pay_identity_unique unique (id, company_id);
alter table public.workers alter column pay_rate_effective_from set default ((now() at time zone 'Asia/Seoul')::date);

create table public.worker_pay_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  worker_id uuid not null,
  effective_from date not null,
  daily_wage numeric,
  leader_allowance numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_pay_rates_worker_company_fkey foreign key (worker_id, company_id) references public.workers(id, company_id) on delete cascade,
  constraint worker_pay_rates_daily_wage_check check (daily_wage is null or (daily_wage between 0 and 100000000 and daily_wage = trunc(daily_wage))),
  constraint worker_pay_rates_leader_allowance_check check (leader_allowance between 0 and 100000000 and leader_allowance = trunc(leader_allowance)),
  constraint worker_pay_rates_worker_date_unique unique (worker_id, effective_from)
);
create index worker_pay_rates_company_worker_idx on public.worker_pay_rates (company_id, worker_id, effective_from);
alter table public.worker_pay_rates enable row level security;

-- Active company owners administer pay history. Worker accounts receive only
-- their own calculated totals via the server API.
revoke all on table public.worker_pay_rates from anon, authenticated;
grant select, insert, update on table public.worker_pay_rates to authenticated;
grant all on table public.worker_pay_rates to service_role;
create policy worker_pay_rates_select on public.worker_pay_rates for select to authenticated
  using (company_id = (select public.current_company_id())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'owner' and p.is_active = true));
create policy worker_pay_rates_insert on public.worker_pay_rates for insert to authenticated
  with check (company_id = (select public.current_company_id())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'owner' and p.is_active = true));
create policy worker_pay_rates_update on public.worker_pay_rates for update to authenticated
  using (company_id = (select public.current_company_id())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'owner' and p.is_active = true))
  with check (company_id = (select public.current_company_id())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'owner' and p.is_active = true));

insert into public.worker_pay_rates (company_id, worker_id, effective_from, daily_wage, leader_allowance)
select company_id, id, date '1900-01-01', daily_wage, 0 from public.workers;

create function public.record_worker_pay_rate() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.daily_wage is not distinct from old.daily_wage
      and new.leader_allowance is not distinct from old.leader_allowance
      and new.pay_rate_effective_from is not distinct from old.pay_rate_effective_from then
      return new;
    end if;
    if new.pay_rate_effective_from < old.pay_rate_effective_from then
      raise exception '적용 시작일은 이전 단가 적용일 이후로 지정해주세요.';
    end if;
    -- Legacy clients that update only daily_wage still create a dated snapshot.
    if new.pay_rate_effective_from = date '1900-01-01' then
      new.pay_rate_effective_from := (now() at time zone 'Asia/Seoul')::date;
    end if;
  end if;
  if new.pay_rate_effective_from > (now() at time zone 'Asia/Seoul')::date then
    raise exception '적용 시작일은 오늘 또는 과거 날짜로 지정해주세요.';
  end if;
  return new;
end;
$$;

create function public.save_worker_pay_rate() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.worker_pay_rates (company_id, worker_id, effective_from, daily_wage, leader_allowance)
  values (new.company_id, new.id, new.pay_rate_effective_from, new.daily_wage, new.leader_allowance)
  on conflict (worker_id, effective_from) do update set
    daily_wage = excluded.daily_wage, leader_allowance = excluded.leader_allowance, updated_at = now();
  return new;
end;
$$;
revoke all on function public.record_worker_pay_rate() from public;
revoke all on function public.save_worker_pay_rate() from public;
grant execute on function public.record_worker_pay_rate(), public.save_worker_pay_rate() to authenticated, service_role;
create trigger workers_validate_pay_rate before insert or update of daily_wage, leader_allowance, pay_rate_effective_from
  on public.workers for each row execute function public.record_worker_pay_rate();
create trigger workers_save_pay_rate after insert or update of daily_wage, leader_allowance, pay_rate_effective_from
  on public.workers for each row execute function public.save_worker_pay_rate();
