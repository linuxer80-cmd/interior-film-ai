-- Read-only, service-only assessment before account access is blocked.
begin;
create or replace function public.assess_account_deletion_orders(p_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$ begin
 if p_user is null then raise exception 'User required'; end if;
 return jsonb_build_object(
 'dealer_transfer_required',exists(select 1 from public.material_pilot_dealers where user_id=p_user),
 'open_orders',exists(select 1 from public.material_pilot_orders where buyer_id=p_user and status not in ('received','cancelled')),
 'delivery_review_required',exists(select 1 from public.material_pilot_orders where buyer_id=p_user and (shipping<>'{}'::jsonb or shipments<>'[]'::jsonb)),
 'saved_addresses_review_required',exists(select 1 from public.material_shipping_addresses where created_by=p_user));
end;$f$;
revoke all on function public.assess_account_deletion_orders(uuid) from public,anon,authenticated;
grant execute on function public.assess_account_deletion_orders(uuid) to service_role;
commit;
