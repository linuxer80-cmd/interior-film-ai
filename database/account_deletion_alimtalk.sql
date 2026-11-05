-- Actor references only; credit accounting and delivery receipts are retained.
begin;
alter table public.alimtalk_credit_entries alter column actor_id drop not null;
create or replace function public.scrub_account_alimtalk_actors(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 update public.alimtalk_credit_entries set actor_id=null where actor_id=u;
 update public.alimtalk_deliveries set created_by=null where created_by=u;
 if exists(select 1 from public.alimtalk_credit_entries where actor_id=u)
 or exists(select 1 from public.alimtalk_deliveries where created_by=u) then
 raise exception 'Alimtalk actor cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_alimtalk_actors(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_alimtalk_actors(uuid,uuid) to service_role;
commit;
