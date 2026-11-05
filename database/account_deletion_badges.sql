-- Remove personal awards; retain company credit accounting and request deduplication.
begin;
create or replace function public.scrub_account_badges(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid;
begin
 select user_id into u from public.account_deletion_requests where id=p_request
 and lease_token=p_lease and lease_until>now() and identity_verified=true
 and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('badge-ai-spend',0));
 delete from public.achievement_receipts where user_id=u or subject_key='user:'||u::text;
 delete from public.achievement_preferences where user_id=u or subject_key='user:'||u::text;
 delete from public.badge_ai_credits where subject_key='user:'||u::text;
 delete from public.achievement_awards where subject_key='user:'||u::text;
 update public.badge_ai_requests set actor=null where actor=u;
 if exists(select 1 from public.achievement_receipts where user_id=u or subject_key='user:'||u::text)
 or exists(select 1 from public.achievement_preferences where user_id=u or subject_key='user:'||u::text)
 or exists(select 1 from public.badge_ai_credits where subject_key='user:'||u::text)
 or exists(select 1 from public.achievement_awards where subject_key='user:'||u::text)
 or exists(select 1 from public.badge_ai_requests where actor=u) then raise exception 'Badge cleanup not verified'; end if;
 return true;
end;$f$;
revoke all on function public.scrub_account_badges(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scrub_account_badges(uuid,uuid) to service_role;
commit;
