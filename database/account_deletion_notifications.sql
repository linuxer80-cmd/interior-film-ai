begin;
create or replace function public.scrub_account_notifications(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid; ids uuid[];
begin
 select user_id,worker_ids into u,ids from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 ids:=array(select distinct x from unnest(ids||array(select id from public.workers where user_id=u)) x);
 if exists(select 1 from public.workers where id=any(ids) and user_id is not null and user_id<>u) then raise exception 'Conflicting worker identity'; end if;
 if exists(select 1 from public.notifications where recipient_worker_id=any(ids) and recipient_user_id is not null and recipient_user_id<>u) then raise exception 'Conflicting notification recipient'; end if;
 delete from public.notifications where recipient_user_id=u or (recipient_type='worker' and recipient_worker_id=any(ids));
 delete from public.labor_notifications where user_id=u;
 delete from public.site_change_receipts where worker_id=any(ids);
 if exists(select 1 from public.notifications where recipient_user_id=u or (recipient_type='worker' and recipient_worker_id=any(ids)))
 or exists(select 1 from public.labor_notifications where user_id=u)
 or exists(select 1 from public.site_change_receipts where worker_id=any(ids)) then raise exception 'Notification cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_notifications(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_notifications(uuid,uuid) to service_role;
commit;
