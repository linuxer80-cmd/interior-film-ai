begin;
alter table public.worker_relationships alter column user_id drop not null;
alter table public.worker_relationships drop constraint if exists deleted_relationship_must_be_ended;
alter table public.worker_relationships add constraint deleted_relationship_must_be_ended check(user_id is not null or ended_at is not null);
create or replace function public.scrub_account_relationships(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid; ids uuid[];
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 perform 1 from public.worker_relationships where user_id=u for update;
 select coalesce(array_agg(worker_id),'{}'::uuid[]) into ids from public.worker_relationships where user_id=u;
 perform 1 from public.workers where id=any(ids) for update;
 if exists(select 1 from public.workers where id=any(ids) and user_id is not null and user_id<>u) then
   raise exception 'Conflicting worker identity requires review';
 end if;
 update public.account_deletion_requests set worker_ids=array(select distinct x from unnest(worker_ids||ids) x) where id=p_request;
 update public.worker_relationships set ended_at=coalesce(ended_at,now()),user_id=null where user_id=u;
 update public.worker_relationship_invites set
   claimant_email=case when claimant=u or (claimant is null and expected_user=u) then null else claimant_email end,
   claimant=case when claimant=u then null else claimant end,
   expected_user=case when expected_user=u then null else expected_user end,
   status=case when status in ('pending','requested') then 'cancelled' else status end
 where claimant=u or expected_user=u;
 if exists(select 1 from public.worker_relationships where user_id=u)
 or exists(select 1 from public.worker_relationship_invites where claimant=u or expected_user=u) then
   raise exception 'Relationship cleanup not verified';
 end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_relationships(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_relationships(uuid,uuid) to service_role;
create or replace function app_private.guard_deleting_worker_relationship()
returns trigger language plpgsql security definer set search_path=''
as $f$ begin
 if new.user_id is not null then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,812437));
   if exists(select 1 from public.account_deletion_blocks where user_id=new.user_id) then
     raise exception 'Account deletion in progress' using errcode='42501';
   end if;
 end if;
 return new;
end;$f$;
revoke all on function app_private.guard_deleting_worker_relationship() from public,anon,authenticated;
drop trigger if exists guard_deleting_worker_relationship on public.worker_relationships;
create trigger guard_deleting_worker_relationship before insert or update on public.worker_relationships
for each row execute function app_private.guard_deleting_worker_relationship();
commit;
