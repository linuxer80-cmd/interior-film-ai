-- Inventory only. Physical files must be removed through the Storage API.
begin;
create or replace function public.inspect_account_deletion_audio(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=''
as $f$ declare u uuid; paths jsonb;
begin
 select coalesce(user_id,subject_id) into u from public.account_deletion_requests
 where id=p_request and lease_token=p_lease and lease_until>now()
 and identity_verified=true and scope='personal_account' and status in ('processing','failed');
 if u is null then raise exception 'Invalid deletion lease'; end if;
 if not exists(select 1 from public.account_deletion_blocks where user_id=u) then raise exception 'Access block required'; end if;
 select coalesce(jsonb_agg(name order by name),'[]'::jsonb) into paths
 from storage.objects where bucket_id='site-call-audio-private'
 and (split_part(name,'/',2)=u::text or owner_id=u::text or owner=u);
 return paths;
end;$f$;
revoke all on function public.inspect_account_deletion_audio(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inspect_account_deletion_audio(uuid,uuid) to service_role;
commit;
