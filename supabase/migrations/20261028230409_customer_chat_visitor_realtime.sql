-- The topic is a separate, unguessable capability used only for empty events.
-- The HTTP-only visitor cookie remains the only credential for chat contents.
alter table public.customer_chat_threads add column visitor_realtime_topic text
 not null default ('customer-chat-visitor:' || encode(extensions.gen_random_bytes(32),'hex'));
create unique index customer_chat_visitor_realtime_topic_idx on public.customer_chat_threads(visitor_realtime_topic);
create schema customer_chat_capabilities;
revoke all on schema customer_chat_capabilities from public;
create table customer_chat_capabilities.topics (
 topic text primary key,
 thread_id uuid not null unique references public.customer_chat_threads(id) on delete cascade
);
alter table customer_chat_capabilities.topics enable row level security;
revoke all on customer_chat_capabilities.topics from public, anon, authenticated;
grant usage on schema customer_chat_capabilities to anon;
grant select(topic) on customer_chat_capabilities.topics to anon;
create policy "visitor can check known topic" on customer_chat_capabilities.topics
for select to anon using (topic=(select realtime.topic()));
insert into customer_chat_capabilities.topics(topic,thread_id)
 select visitor_realtime_topic,id from public.customer_chat_threads;

create or replace function customer_chat_capabilities.sync_topic()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into customer_chat_capabilities.topics(topic,thread_id) values (new.visitor_realtime_topic,new.id)
 on conflict(thread_id) do update set topic=excluded.topic;
 return null;
end $$;
revoke all on function customer_chat_capabilities.sync_topic() from public,anon,authenticated;
create trigger customer_chat_visitor_sync_topic after insert or update of visitor_realtime_topic on public.customer_chat_threads
for each row execute function customer_chat_capabilities.sync_topic();

-- Existing private-channel policies also restrict rows to the current topic.
-- This prevents a permitted subscriber from reading other channels' event rows.
alter policy "customer chat admin receive invalidations" on realtime.messages
 using (extension='broadcast' and topic=(select realtime.topic()) and app_private.can_receive_customer_chat_admin((select realtime.topic())));
alter policy "team chat receive invalidations" on realtime.messages
 using (extension='broadcast' and topic=(select realtime.topic()) and app_private.can_receive_team_chat((select realtime.topic())));
alter policy "team unread receive own invalidations" on realtime.messages
 using (extension='broadcast' and topic=(select realtime.topic()) and (select auth.uid()) is not null
  and (select realtime.topic())='team-unread:' || (select auth.uid())::text);
create policy "visitor receive own customer chat invalidations" on realtime.messages
for select to anon
using (extension='broadcast' and topic=(select realtime.topic()) and exists (
 select 1 from customer_chat_capabilities.topics t where t.topic=(select realtime.topic())
));

create or replace function customer_chat_capabilities.notify_visitor()
returns trigger language plpgsql security definer set search_path='' as $$
declare visitor_topic text;
begin
 if new.sender <> 'owner' then return null; end if;
 select t.visitor_realtime_topic into visitor_topic from public.customer_chat_threads t where t.id=new.thread_id;
 if visitor_topic is not null then
  begin
   perform realtime.send('{}'::jsonb,'changed',visitor_topic,true);
  exception when others then raise warning 'customer visitor notification failed: %',sqlstate; end;
 end if;
 return null;
end $$;
revoke all on function customer_chat_capabilities.notify_visitor() from public,anon,authenticated;
create trigger customer_chat_visitor_message_invalidation after insert on public.customer_chat_messages
for each row execute function customer_chat_capabilities.notify_visitor();
