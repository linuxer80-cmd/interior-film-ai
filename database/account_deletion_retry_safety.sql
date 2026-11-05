begin;
alter table public.account_deletion_requests add column if not exists subject_id uuid;
update public.account_deletion_requests set subject_id=user_id where subject_id is null and user_id is not null;
create or replace function public.capture_deletion_subject() returns trigger language plpgsql set search_path='' as $f$
begin
 if TG_OP='INSERT' then new.subject_id=new.user_id;
 elsif old.subject_id is not null then new.subject_id=old.subject_id;
 else new.subject_id=old.user_id;
 end if;
 return new;
end;$f$;
drop trigger if exists capture_deletion_subject on public.account_deletion_requests;
create trigger capture_deletion_subject before insert or update on public.account_deletion_requests for each row execute function public.capture_deletion_subject();
create or replace function public.claim_account_deletion_request(p_request uuid)
returns setof public.account_deletion_requests language sql security definer set search_path=''
as $f$
 update public.account_deletion_requests set status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1,updated_at=clock_timestamp()
 where id=p_request and status in ('review_required','processing','failed') and identity_verified=true and scope='personal_account'
 and lease_token is null
 returning *;
$f$;
revoke all on function public.claim_account_deletion_request(uuid) from public,anon,authenticated;
grant execute on function public.claim_account_deletion_request(uuid) to service_role;
commit;
