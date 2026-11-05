begin;
alter table public.account_deletion_requests add column if not exists lease_token uuid;
alter table public.account_deletion_requests add column if not exists lease_until timestamptz;
alter table public.account_deletion_requests add column if not exists attempts integer not null default 0;
create or replace function public.claim_account_deletion_request(p_request uuid)
returns setof public.account_deletion_requests language sql security definer set search_path=''
as $f$
 update public.account_deletion_requests
 set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',
 attempts=attempts+1,updated_at=now()
 where id=p_request and status in ('processing','failed')
 and identity_verified=true and scope='personal_account'
 and (lease_until is null or lease_until<now())
 returning *;
$f$;
revoke all on function public.claim_account_deletion_request(uuid) from public,anon,authenticated;
grant execute on function public.claim_account_deletion_request(uuid) to service_role;
commit;
