begin;
create or replace function app_private.guard_deleting_private_upload()
returns trigger language plpgsql security definer set search_path=''
as $f$ declare candidates text[]; candidate text; u uuid;
begin
 candidates:=array[case new.bucket_id
   when 'labor-avatars' then split_part(new.name,'/',1)
   when 'site-call-audio-private' then split_part(new.name,'/',2) end];
 if tg_op='UPDATE' then
   candidates:=array_append(candidates,case old.bucket_id
     when 'labor-avatars' then split_part(old.name,'/',1)
     when 'site-call-audio-private' then split_part(old.name,'/',2) end);
 end if;
 for candidate in select distinct lower(x) from unnest(candidates) x
   where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' order by 1
 loop
   u:=candidate::uuid;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,812437));
   if exists(select 1 from public.account_deletion_blocks where user_id=u)
     or exists(select 1 from public.account_deletion_requests
       where subject_id=u and user_id is null and identity_verified=true
       and scope='personal_account' and status in ('processing','failed','completed')) then
     raise exception 'Account deletion in progress' using errcode='42501';
   end if;
 end loop;
 return new;
end;$f$;
revoke all on function app_private.guard_deleting_private_upload() from public,anon,authenticated;
drop trigger if exists guard_deleting_private_upload on storage.objects;
create trigger guard_deleting_private_upload before insert or update on storage.objects
 for each row execute function app_private.guard_deleting_private_upload();
commit;
