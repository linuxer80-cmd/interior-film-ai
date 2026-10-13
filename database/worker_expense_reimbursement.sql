begin;
alter table public.site_expenses
  add column if not exists reimbursement_worker_id uuid
  references public.workers(id);
create index if not exists site_expenses_reimbursement_month_idx
  on public.site_expenses(company_id,reimbursement_worker_id,expense_date)
  where reimbursement_worker_id is not null;

create or replace function public.validate_expense_reimbursement()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.reimbursement_worker_id is not null and not exists (
    select 1 from public.workers w
    where w.id=new.reimbursement_worker_id and w.company_id=new.company_id
  ) then
    raise exception '경비 지급 대상의 업체가 일치하지 않습니다.';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_expense_reimbursement() from public,anon,authenticated;
drop trigger if exists validate_expense_reimbursement on public.site_expenses;
create trigger validate_expense_reimbursement
before insert or update of reimbursement_worker_id,company_id on public.site_expenses
for each row execute function public.validate_expense_reimbursement();
commit;
