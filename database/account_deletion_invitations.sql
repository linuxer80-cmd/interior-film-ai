begin;
alter table public.worker_relationship_invites alter column created_by drop not null;
alter table public.worker_connection_requests alter column created_by drop not null;
alter table public.direct_worker_invitations alter column created_by drop not null;
alter table public.worker_relationship_invites drop constraint if exists deleted_creator_no_pending_invite;
alter table public.worker_relationship_invites add constraint deleted_creator_no_pending_invite check(created_by is not null or status not in ('pending','requested'));
alter table public.worker_connection_requests drop constraint if exists deleted_creator_no_pending_connection;
alter table public.worker_connection_requests add constraint deleted_creator_no_pending_connection check(created_by is not null or status<>'pending');
alter table public.direct_worker_invitations drop constraint if exists deleted_creator_no_pending_direct_invite;
alter table public.direct_worker_invitations add constraint deleted_creator_no_pending_direct_invite check(created_by is not null or status<>'pending');
create or replace function public.scrub_account_invitations(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 update public.worker_relationship_invites set created_by=null,
 status=case when status in ('pending','requested') then 'cancelled' else status end where created_by=u;
 update public.worker_connection_requests set
 created_by=case when created_by=u then null else created_by end,
 target_user_id=case when target_user_id=u then null else target_user_id end,
 message='',status=case when status='pending' then 'cancelled' else status end,
 revision=revision+1,updated_at=now() where created_by=u or target_user_id=u;
 update public.direct_worker_invitations set
 created_by=case when created_by=u then null else created_by end,
 accepted_user_id=case when accepted_user_id=u then null else accepted_user_id end,
 status=case when status='pending' then 'cancelled' else status end
 where created_by=u or accepted_user_id=u;
 if exists(select 1 from public.worker_relationship_invites where created_by=u)
 or exists(select 1 from public.worker_connection_requests where created_by=u or target_user_id=u)
 or exists(select 1 from public.direct_worker_invitations where created_by=u or accepted_user_id=u) then
 raise exception 'Invitation cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_invitations(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_invitations(uuid,uuid) to service_role;
commit;
