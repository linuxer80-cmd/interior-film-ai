begin;
create or replace function public.block_account_deletion_access(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests
 where id=p_request and lease_token=p_lease and lease_until>now()
 and identity_verified=true and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 -- Serialize deletion decisions for all administrators of the same company.
 perform 1 from public.companies c join public.profiles p on p.company_id=c.id
 where p.id=u and p.role='owner' for update of c;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,812437));
 if public.account_deletion_shared_auth_check(u) then raise exception 'Shared account requires review'; end if;
 if exists(select 1 from public.profiles p where p.id=u and p.role='owner' and p.company_id is not null
 and not exists(select 1 from public.profiles other where other.company_id=p.company_id and other.id<>u and other.role='owner' and other.is_active=true)) then
 raise exception 'Owner transfer required'; end if;
 insert into public.account_deletion_blocks(user_id) values(u) on conflict(user_id) do nothing;
 update public.profiles set is_active=false,updated_at=now() where id=u;
 update public.workers set is_active=false,updated_at=now() where user_id=u;
 delete from public.push_subscriptions where user_id=u;
 return true;
end;
$f$;
revoke all on function public.block_account_deletion_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.block_account_deletion_access(uuid,uuid) to service_role;
drop policy if exists push_block_deleting_account on public.push_subscriptions;
create policy push_block_deleting_account on public.push_subscriptions as restrictive for all to authenticated
 using(not exists(select 1 from public.account_deletion_blocks d where d.user_id=(select auth.uid())))
 with check(not exists(select 1 from public.account_deletion_blocks d where d.user_id=(select auth.uid())));
commit;
