begin;
create schema if not exists app_private;
create table if not exists app_private.company_receivable_deletions(company_id uuid primary key,request_id uuid not null,created_at timestamptz not null default now());
alter table app_private.company_receivable_deletions enable row level security;
revoke all on app_private.company_receivable_deletions from public,anon,authenticated,service_role;
create or replace function app_private.guard_deleted_company_receivables()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare co uuid;
begin
 co:=(to_jsonb(new)->>'company_id')::uuid;
 if tg_table_name='trade_payment_allocations' then
 select company_id into co from public.trade_payment_batches where id=new.batch_id;
 end if;
 if exists(select 1 from app_private.company_receivable_deletions where company_id=co)
 or (tg_op='UPDATE' and exists(select 1 from app_private.company_receivable_deletions where company_id=(to_jsonb(old)->>'company_id')::uuid)) then
 raise exception 'Company receivables are being deleted' using errcode='23514';end if;
 return new;
end;$f$;
revoke all on function app_private.guard_deleted_company_receivables() from public,anon,authenticated;
do $f$ declare t text;begin foreach t in array array['site_payment_accounts','site_payment_entries','trade_payment_batches','trade_payment_allocations'] loop
 execute format('drop trigger if exists guard_deleted_company_receivables on public.%I',t);
 execute format('create trigger guard_deleted_company_receivables before insert or update on public.%I for each row execute function app_private.guard_deleted_company_receivables()',t);
end loop;end;$f$;
create or replace function public.delete_company_receivables(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare co uuid; u uuid;
begin
 select company_deletion_id,user_id into co,u from public.account_deletion_requests
 where id=p_request and identity_verified=true and scope='personal_account' and status in('processing','failed')
 and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if co is null or u is null then raise exception 'Verified company deletion lease required';end if;
 perform 1 from public.companies where id=co for update;
 perform public.inspect_company_deletion_scope(p_request);
 lock table public.sites,public.trade_clients,public.site_payment_accounts,public.site_payment_entries,public.trade_payment_batches,public.trade_payment_allocations in share row exclusive mode;
 if exists(select 1 from public.site_payment_accounts a join public.sites s on s.id=a.site_id where (a.company_id=co or s.company_id=co) and a.company_id is distinct from s.company_id)
 or exists(select 1 from public.site_payment_entries e join public.sites s on s.id=e.site_id where (e.company_id=co or s.company_id=co) and e.company_id is distinct from s.company_id)
 or exists(select 1 from public.trade_payment_batches b join public.trade_clients c on c.id=b.client_id where (b.company_id=co or c.company_id=co) and b.company_id is distinct from c.company_id)
 or exists(select 1 from public.trade_payment_allocations a join public.trade_payment_batches b on b.id=a.batch_id join public.site_payment_entries e on e.id=a.entry_id where (b.company_id=co or e.company_id=co) and b.company_id is distinct from e.company_id)
 then raise exception 'Cross-company receivable reference requires review';end if;
 insert into app_private.company_receivable_deletions(company_id,request_id) values(co,p_request) on conflict(company_id) do nothing;
 if not exists(select 1 from app_private.company_receivable_deletions where company_id=co and request_id=p_request) then raise exception 'Company deletion request mismatch';end if;
 delete from public.trade_payment_allocations where batch_id in(select id from public.trade_payment_batches where company_id=co);
 delete from public.site_payment_entries where company_id=co;
 delete from public.site_payment_accounts where company_id=co;
 delete from public.trade_payment_batches where company_id=co;
 if exists(select 1 from public.site_payment_entries where company_id=co) or exists(select 1 from public.site_payment_accounts where company_id=co) or exists(select 1 from public.trade_payment_batches where company_id=co) then raise exception 'Receivable cleanup not verified';end if;
 if not public.assert_account_deletion_lease(p_request,p_lease,u) then raise exception 'Deletion lease expired';end if;
 return true;
end;$f$;
revoke all on function public.delete_company_receivables(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_company_receivables(uuid,uuid) to service_role;
commit;
