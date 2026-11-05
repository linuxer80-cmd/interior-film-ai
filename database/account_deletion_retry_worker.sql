begin;
-- Retry only already-started, verified requests whose previous worker released
-- its lease. An expired non-null lease still needs explicit stopped-worker
-- recovery. Never turn review_required requests into automatic deletion here.
create or replace function public.claim_account_deletion_retry(p_request uuid)
returns setof public.account_deletion_requests language sql security definer set search_path=''
as $f$
 update public.account_deletion_requests
 set status='processing',lease_token=gen_random_uuid(),
 lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1,updated_at=clock_timestamp()
 where id=p_request and status='failed' and identity_verified=true and scope='personal_account'
 and subject_id is not null and (user_id is null or user_id=subject_id)
 and lease_token is null and attempts between 1 and 4
 and updated_at<=clock_timestamp()-interval '5 minutes'
 returning *;
$f$;
revoke all on function public.claim_account_deletion_retry(uuid) from public,anon,authenticated;
grant execute on function public.claim_account_deletion_retry(uuid) to service_role;
commit;
