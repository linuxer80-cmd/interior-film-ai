-- Removes account identifiers only; financial amounts and business history stay intact.
begin;
alter table public.labor_payment_records alter column created_by drop not null;
alter table public.site_payment_accounts alter column created_by drop not null;
alter table public.site_payment_accounts alter column updated_by drop not null;
alter table public.site_payment_entries alter column created_by drop not null;
alter table public.trade_payment_batches alter column created_by drop not null;
alter table public.labor_payment_records add column if not exists cancelled_actor_deleted boolean not null default false;
alter table public.labor_payment_records drop constraint if exists labor_payment_records_check;
alter table public.labor_payment_records add constraint labor_payment_records_check check(
 (cancelled_at is null and cancelled_by is null and not cancelled_actor_deleted)
 or (cancelled_at is not null and ((cancelled_by is not null and not cancelled_actor_deleted)
 or (cancelled_by is null and cancelled_actor_deleted))));
create or replace function public.scrub_account_payment_actors(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 update public.labor_payment_records set
 created_by=case when created_by=u then null else created_by end,
 cancelled_actor_deleted=cancelled_actor_deleted or cancelled_by is not distinct from u,
 cancelled_by=case when cancelled_by=u then null else cancelled_by end
 where created_by=u or cancelled_by=u;
 update public.site_payment_accounts set
 created_by=case when created_by=u then null else created_by end,
 updated_by=case when updated_by=u then null else updated_by end
 where created_by=u or updated_by=u;
 update public.site_payment_entries set
 created_by=case when created_by=u then null else created_by end,
 voided_by=case when voided_by=u then null else voided_by end
 where created_by=u or voided_by=u;
 update public.trade_payment_batches set created_by=null where created_by=u;
 if exists(select 1 from public.labor_payment_records where created_by=u or cancelled_by=u)
 or exists(select 1 from public.site_payment_accounts where created_by=u or updated_by=u)
 or exists(select 1 from public.site_payment_entries where created_by=u or voided_by=u)
 or exists(select 1 from public.trade_payment_batches where created_by=u) then
 raise exception 'Payment actor cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_payment_actors(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_payment_actors(uuid,uuid) to service_role;
commit;
