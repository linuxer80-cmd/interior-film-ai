begin;
create or replace function app_private.guard_deleting_badge_identity()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare doc jsonb:=to_jsonb(new); candidate text; u uuid;
begin
 for candidate in select distinct x from unnest(array[
 doc->>'user_id',doc->>'actor',
 case when doc->>'subject_key' like 'user:%' then substr(doc->>'subject_key',6) end
 ]) x where x is not null order by x loop
 u:=candidate::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,812437));
 if exists(select 1 from public.account_deletion_blocks where user_id=u)
 or exists(select 1 from public.account_deletion_requests where subject_id=u and user_id is null
 and identity_verified=true and scope='personal_account' and status in ('processing','failed','completed')) then
 raise exception 'Account deletion in progress' using errcode='42501';end if;
 end loop;
 return new;
end;$f$;
revoke all on function app_private.guard_deleting_badge_identity() from public,anon,authenticated;
drop trigger if exists guard_deleting_badge_identity on public.achievement_awards;
create trigger guard_deleting_badge_identity before insert or update on public.achievement_awards for each row execute function app_private.guard_deleting_badge_identity();
drop trigger if exists guard_deleting_badge_identity on public.achievement_receipts;
create trigger guard_deleting_badge_identity before insert or update on public.achievement_receipts for each row execute function app_private.guard_deleting_badge_identity();
drop trigger if exists guard_deleting_badge_identity on public.achievement_preferences;
create trigger guard_deleting_badge_identity before insert or update on public.achievement_preferences for each row execute function app_private.guard_deleting_badge_identity();
drop trigger if exists guard_deleting_badge_identity on public.badge_ai_credits;
create trigger guard_deleting_badge_identity before insert or update on public.badge_ai_credits for each row execute function app_private.guard_deleting_badge_identity();
drop trigger if exists guard_deleting_badge_identity on public.badge_ai_requests;
create trigger guard_deleting_badge_identity before insert or update on public.badge_ai_requests for each row execute function app_private.guard_deleting_badge_identity();
commit;
