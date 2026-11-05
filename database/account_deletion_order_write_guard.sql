begin;
create or replace function app_private.guard_deleting_order_actor()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare u uuid; previous uuid;
begin
 u:=(to_jsonb(new)->>tg_argv[0])::uuid;
 if u is null then return new; end if;
 if tg_op='UPDATE' then
   previous:=(to_jsonb(old)->>tg_argv[0])::uuid;
   -- Updating shared order state is allowed; introducing a blocked actor is not.
   if previous is not distinct from u then return new; end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,812437));
 if exists(select 1 from public.account_deletion_blocks where user_id=u)
 or exists(select 1 from public.account_deletion_requests where subject_id=u and user_id is null
   and identity_verified=true and scope='personal_account' and status in ('processing','failed','completed')) then
   raise exception 'Account deletion in progress' using errcode='42501';
 end if;
 return new;
end;$f$;
revoke all on function app_private.guard_deleting_order_actor() from public,anon,authenticated;
drop trigger if exists guard_deleting_order_actor on public.material_pilot_orders;
create trigger guard_deleting_order_actor before insert or update of buyer_id on public.material_pilot_orders
for each row execute function app_private.guard_deleting_order_actor('buyer_id');
drop trigger if exists guard_deleting_order_actor on public.material_pilot_events;
create trigger guard_deleting_order_actor before insert or update of actor_id on public.material_pilot_events
for each row execute function app_private.guard_deleting_order_actor('actor_id');
drop trigger if exists guard_deleting_order_actor on public.material_shipping_addresses;
create trigger guard_deleting_order_actor before insert or update of created_by on public.material_shipping_addresses
for each row execute function app_private.guard_deleting_order_actor('created_by');
commit;
