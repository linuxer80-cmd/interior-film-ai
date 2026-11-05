-- Server-only recovery. The caller must verify the previous worker has stopped
-- and no storage/auth request is in flight. This is not automatic recovery.
begin;
create or replace function public.recover_account_deletion_attempt(p_request uuid,p_old_lease uuid,p_execution_stopped boolean)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare n integer;
begin
 if p_execution_stopped is distinct from true then raise exception 'Previous execution termination must be verified'; end if;
 update public.account_deletion_requests set lease_token=null,lease_until=null,status='failed',updated_at=now()
 where id=p_request and lease_token=p_old_lease and lease_until<now()
 and status in ('processing','failed');
 get diagnostics n=row_count;
 return n=1;
end;
$f$;
revoke all on function public.recover_account_deletion_attempt(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.recover_account_deletion_attempt(uuid,uuid,boolean) to service_role;
commit;
