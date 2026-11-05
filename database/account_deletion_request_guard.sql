begin;
create or replace function public.guard_deleting_request_cache()
returns trigger language plpgsql security definer set search_path=''
as $f$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,812437));
 if exists(select 1 from public.account_deletion_blocks where user_id=new.user_id)
 then raise exception 'Account deletion in progress' using errcode='42501'; end if;
 return new;
end;$f$;
revoke all on function public.guard_deleting_request_cache() from public,anon,authenticated;
drop trigger if exists guard_deleting_screenshot_insert on public.site_screenshot_requests;
create trigger guard_deleting_screenshot_insert before insert on public.site_screenshot_requests for each row execute function public.guard_deleting_request_cache();
drop trigger if exists guard_deleting_consultation_insert on public.consultation_registration_requests;
create trigger guard_deleting_consultation_insert before insert on public.consultation_registration_requests for each row execute function public.guard_deleting_request_cache();
commit;
