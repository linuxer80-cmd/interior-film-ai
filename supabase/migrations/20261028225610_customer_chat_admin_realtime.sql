-- Only an active company owner may receive their company's empty invalidations.
create or replace function app_private.can_receive_customer_chat_admin(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(exists (
  select 1 from public.profiles p join public.companies c on c.id=p.company_id
  where p.id=(select auth.uid()) and p.role='owner' and p.is_active is not false
   and c.is_active is true and p_topic='customer-chat-admin:' || p.company_id::text
 ), false)
$$;
revoke all on function app_private.can_receive_customer_chat_admin(text) from public, anon;
grant execute on function app_private.can_receive_customer_chat_admin(text) to authenticated;
create policy "customer chat admin receive invalidations" on realtime.messages
for select to authenticated
using (extension='broadcast' and app_private.can_receive_customer_chat_admin((select realtime.topic())));

create or replace function app_private.notify_customer_chat_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare company uuid; old_company uuid;
begin
 if tg_table_name='customer_chat_messages' then
  select t.company_id into company from public.customer_chat_threads t where t.id=new.thread_id;
 elsif tg_op='DELETE' then
  company := old.company_id;
 else
  company := new.company_id;
  if tg_op='UPDATE' and old.company_id is distinct from new.company_id then old_company := old.company_id; end if;
 end if;
 if company is not null then
  begin
   perform realtime.send('{}'::jsonb,'changed','customer-chat-admin:' || company::text,true);
  exception when others then raise warning 'customer chat notification failed: %', sqlstate; end;
 end if;
 if old_company is not null then
  begin
   perform realtime.send('{}'::jsonb,'changed','customer-chat-admin:' || old_company::text,true);
  exception when others then raise warning 'customer chat notification failed: %', sqlstate; end;
 end if;
 return null;
end $$;
revoke all on function app_private.notify_customer_chat_admin() from public, anon, authenticated;
create trigger customer_chat_admin_message_invalidation after insert on public.customer_chat_messages
for each row execute function app_private.notify_customer_chat_admin();
create trigger customer_chat_admin_thread_insert_delete_invalidation after insert or delete on public.customer_chat_threads
for each row execute function app_private.notify_customer_chat_admin();
create trigger customer_chat_admin_thread_update_invalidation after update on public.customer_chat_threads
for each row when (old.owner_read_at is distinct from new.owner_read_at
 or old.customer_name is distinct from new.customer_name or old.company_id is distinct from new.company_id)
execute function app_private.notify_customer_chat_admin();
