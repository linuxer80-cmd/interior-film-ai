begin;
create or replace function public.scrub_account_worker_details(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$
declare u uuid; ids uuid[]; n integer;
begin
 select user_id into u from public.account_deletion_requests
 where id=p_request and lease_token=p_lease and lease_until>now()
 and identity_verified=true and scope='personal_account' and status in ('processing','failed')
 for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then
 raise exception 'Access block required before cleanup'; end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into ids from public.workers where user_id=u or id=any((select worker_ids from public.account_deletion_requests where id=p_request)::uuid[]);
 delete from public.worker_private_details where worker_id=any(ids);
 delete from public.labor_personal_details where user_id=u;
 update public.workers set name='탈퇴한 시공자',phone=null,memo=null,
 position=null,specialties=null,is_active=false,updated_at=now()
 where id=any(ids);
 get diagnostics n=row_count;
 return jsonb_build_object('workers_scrubbed',n);
end;
$f$;
revoke all on function public.scrub_account_worker_details(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_worker_details(uuid,uuid) to service_role;
commit;
