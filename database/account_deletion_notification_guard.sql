begin;
create or replace function app_private.skip_deleted_account_notification()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare doc jsonb:=to_jsonb(new); w uuid; candidate uuid; candidates uuid[];
begin
 candidates:=array[(doc->>'user_id')::uuid,(doc->>'recipient_user_id')::uuid];
 w:=coalesce((doc->>'worker_id')::uuid,
 case when doc->>'recipient_type'='worker' then (doc->>'recipient_worker_id')::uuid end);
 if w is not null then
 candidates:=candidates||array(select user_id from public.workers where id=w);
 candidates:=candidates||array(select subject_id from public.account_deletion_requests
 where w=any(worker_ids) and identity_verified=true and scope='personal_account'
 and status in ('processing','failed','completed'));
 end if;
 for candidate in select distinct x from unnest(candidates) x where x is not null order by x loop
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(candidate::text,812437));
 if exists(select 1 from public.account_deletion_blocks where user_id=candidate)
 or exists(select 1 from public.account_deletion_requests where subject_id=candidate and user_id is null
 and identity_verified=true and scope='personal_account' and status in ('processing','failed','completed')) then
 -- Skip only this recipient; don't roll back the originating business operation.
 return null;
 end if;
 end loop;
 return new;
end;$f$;
revoke all on function app_private.skip_deleted_account_notification() from public,anon,authenticated;
drop trigger if exists skip_deleted_account_notification on public.notifications;
create trigger skip_deleted_account_notification before insert or update on public.notifications for each row execute function app_private.skip_deleted_account_notification();
drop trigger if exists skip_deleted_account_notification on public.labor_notifications;
create trigger skip_deleted_account_notification before insert or update on public.labor_notifications for each row execute function app_private.skip_deleted_account_notification();
drop trigger if exists skip_deleted_account_notification on public.material_pilot_notifications;
create trigger skip_deleted_account_notification before insert or update on public.material_pilot_notifications for each row execute function app_private.skip_deleted_account_notification();
drop trigger if exists skip_deleted_account_notification on public.site_change_receipts;
create trigger skip_deleted_account_notification before insert or update on public.site_change_receipts for each row execute function app_private.skip_deleted_account_notification();
commit;
