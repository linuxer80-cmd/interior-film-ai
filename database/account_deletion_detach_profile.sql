begin;
create or replace function public.detach_deleted_account_profile(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid; checks jsonb;
begin
 select user_id into u from public.account_deletion_requests
 where id=p_request and lease_token=p_lease and lease_until>now()
 and identity_verified=true and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 checks:=public.verify_account_deletion_core(p_request,p_lease);
 if exists(select 1 from jsonb_each(checks) where key<>'scope' and value<>'true'::jsonb) then raise exception 'Personal cleanup must be verified before detaching'; end if;
 if exists(select 1 from public.worker_relationships where user_id=u) then raise exception 'Worker relationship history requires resolution'; end if;
 perform 1 from public.companies c join public.profiles p on p.company_id=c.id
 where p.id=u and p.role='owner' for update of c;
 if exists(select 1 from public.profiles p where p.id=u and p.role='owner'
 and not(p.company_id is null and exists(
 select 1 from public.account_deletion_requests q where q.id=p_request and q.user_id=u
 and to_jsonb(q)->>'company_record_deleted_at' is not null
 and to_jsonb(q)->>'company_deletion_id' is not null
 and not exists(select 1 from public.companies c where c.id::text=to_jsonb(q)->>'company_deletion_id')))
 and (p.company_id is null or not exists(select 1 from public.profiles other
 where other.company_id=p.company_id and other.id<>u and other.role='owner'
 and other.is_active=true))) then raise exception 'Owner transfer required'; end if;
 update public.account_deletion_requests set worker_ids=array(select distinct x from unnest(worker_ids || array(select id from public.workers where user_id=u)) x) where id=p_request;
 update public.workers set user_id=null,updated_at=now() where user_id=u;
 delete from public.profiles where id=u;
 return not exists(select 1 from public.workers where user_id=u)
 and not exists(select 1 from public.profiles where id=u);
end;$f$;
revoke all on function public.detach_deleted_account_profile(uuid,uuid) from public,anon,authenticated;
grant execute on function public.detach_deleted_account_profile(uuid,uuid) to service_role;
commit;
