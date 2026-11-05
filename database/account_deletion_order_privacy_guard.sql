begin;
create or replace function public.scrub_account_order_actors(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 -- Dealer responsibility and open orders require a separate handover.
 if exists(select 1 from public.material_pilot_dealers where user_id=u) then raise exception 'Dealer transfer required'; end if;
 perform 1 from public.material_pilot_orders where buyer_id=u order by id for update;
 if exists(select 1 from public.material_pilot_orders where buyer_id=u and status not in ('received','cancelled')) then raise exception 'Open orders require review'; end if;
 -- A buyer is not necessarily the recipient. Never erase that attribution
 -- before recipient/contact ownership and shipment retention are reviewed.
 if exists(select 1 from public.material_pilot_orders where buyer_id=u and
 (shipping <> '{}'::jsonb or shipments <> '[]'::jsonb)) then
 raise exception 'Order delivery privacy review required'; end if;
 update public.material_pilot_orders set buyer_id=null where buyer_id=u;
 update public.material_pilot_events set actor_id=null where actor_id=u;
 delete from public.material_pilot_notifications where user_id=u;
 if exists(select 1 from public.material_pilot_orders where buyer_id=u)
 or exists(select 1 from public.material_pilot_events where actor_id=u)
 or exists(select 1 from public.material_pilot_notifications where user_id=u) then raise exception 'Order actor cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_order_actors(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_order_actors(uuid,uuid) to service_role;
commit;
