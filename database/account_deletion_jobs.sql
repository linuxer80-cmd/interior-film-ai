begin;
alter table public.labor_jobs alter column created_by drop not null;
alter table public.labor_jobs drop constraint if exists deleted_job_creator_must_be_closed;
alter table public.labor_jobs add constraint deleted_job_creator_must_be_closed check(created_by is not null or status='closed');
create or replace function public.scrub_account_jobs(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid; ids uuid[];
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 -- Job responses also lock the job row: an already accepted assignment stays accepted.
 perform 1 from public.labor_jobs where created_by=u or proposal_user_id=u order by id for update;
 select coalesce(array_agg(id),'{}'::uuid[]) into ids from public.labor_jobs where created_by=u or proposal_user_id=u;
 update public.labor_jobs set status='closed',
 created_by=case when created_by=u then null else created_by end,
 proposal_user_id=case when proposal_user_id=u then null else proposal_user_id end
 where id=any(ids);
 update public.labor_applications set status='rejected',share_phone=false,updated_at=now()
 where job_id=any(ids) and status in ('invited','applied') and user_id is distinct from u;
 update public.labor_applications set user_id=null,share_phone=false,
 status=case when status in ('invited','applied') then 'withdrawn' else status end,updated_at=now()
 where user_id=u;
 if exists(select 1 from public.labor_jobs where created_by=u or proposal_user_id=u)
 or exists(select 1 from public.labor_applications where user_id=u) then raise exception 'Job cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_jobs(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_jobs(uuid,uuid) to service_role;
commit;
