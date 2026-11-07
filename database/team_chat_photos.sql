begin;
alter table public.worker_team_messages add column if not exists image_path text;
-- Chat attachments must only be signed after the server checks the exact site/date.
drop policy if exists team_chat_photos_server_only on storage.objects;
create policy team_chat_photos_server_only on storage.objects as restrictive for all to anon,authenticated
 using (bucket_id<>'work-photos' or name not like 'sites/%/%/team-chat/%')
 with check (bucket_id<>'work-photos' or name not like 'sites/%/%/team-chat/%');
create or replace function app_private.clear_deleted_team_photo() returns trigger
language plpgsql set search_path='' as $$ begin
 if new.sender_id is null then new.image_path:=null; end if;
 return new;
end; $$;
revoke all on function app_private.clear_deleted_team_photo() from public,anon,authenticated;
drop trigger if exists clear_deleted_team_photo on public.worker_team_messages;
create trigger clear_deleted_team_photo before insert or update on public.worker_team_messages
 for each row execute function app_private.clear_deleted_team_photo();
commit;
