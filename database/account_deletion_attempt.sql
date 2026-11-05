begin;
create or replace function public.finish_account_deletion_attempt(p_request uuid,p_lease uuid,p_status text)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare changed integer;
begin
 if p_status not in ('failed','review_required') or p_status is null then
 raise exception 'Only failed or review_required is permitted; completion requires independent verification'; end if;
 update public.account_deletion_requests set status=p_status,lease_token=null,lease_until=null,updated_at=now()
 where id=p_request and lease_token=p_lease and lease_until>now();
 get diagnostics changed=row_count;
 return changed=1;
end;
$f$;
revoke all on function public.finish_account_deletion_attempt(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_account_deletion_attempt(uuid,uuid,text) to service_role;
commit;
