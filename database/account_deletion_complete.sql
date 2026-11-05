-- Call only after the executor's full inventory and file verification succeeds.
-- These DB checks are additional safeguards, not the full retention inventory.
begin;
create or replace function public.complete_account_deletion(p_request uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=''
as $f$ declare u uuid; checks jsonb; refs jsonb;
begin
 select coalesce(user_id,subject_id) into u from public.account_deletion_requests
 where id=p_request and lease_token=p_lease and lease_until>now()
 and identity_verified=true and scope='personal_account' and status in ('processing','failed') for update;
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if exists(select 1 from auth.users where id=u) then raise exception 'Auth account still exists'; end if;
 checks:=public.verify_account_deletion_core(p_request,p_lease);
 if exists(select 1 from jsonb_each(checks) where key<>'scope' and value<>'true'::jsonb) then raise exception 'Core cleanup incomplete'; end if;
 refs:=public.inspect_account_deletion_references(u);
 if jsonb_array_length(refs)>0 then raise exception 'Account references remain'; end if;
 if exists(select 1 from storage.objects where owner_id=u::text or owner=u
 or (bucket_id='labor-avatars' and split_part(name,'/',1)=u::text)
 or (bucket_id='site-call-audio-private' and split_part(name,'/',2)=u::text)) then raise exception 'Account storage remains'; end if;
 update public.account_deletion_requests set status='completed',lease_token=null,lease_until=null,updated_at=now() where id=p_request;
 return true;
end;$f$;
revoke all on function public.complete_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_account_deletion(uuid,uuid) to service_role;
commit;
