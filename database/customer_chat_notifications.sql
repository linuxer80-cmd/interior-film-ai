begin;
create or replace function public.customer_chat_notify_owner()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare t public.customer_chat_threads%rowtype;
begin
  if new.sender <> 'customer' then return new; end if;
  select * into t from public.customer_chat_threads where id=new.thread_id;
  if not found then raise exception '대화를 찾을 수 없습니다.'; end if;
  insert into public.notifications (
    company_id,recipient_type,type,priority,title,message,
    link,reference_type,reference_id,dedupe_key,is_read,push_sent
  ) values (
    t.company_id,'company_admin','customer_chat','success',
    '고객 채팅 문의',
    t.customer_name || '님이 메시지를 보냈습니다. 대화에서 확인해주세요.',
    '/admin/customer-chat?thread=' || t.id::text,
    'customer_chat',t.id,'customer-chat:' || new.id::text,false,false
  );
  return new;
end $$;
revoke all on function public.customer_chat_notify_owner() from public,anon,authenticated;
grant execute on function public.customer_chat_notify_owner() to service_role;
drop trigger if exists customer_chat_notify_owner on public.customer_chat_messages;
create trigger customer_chat_notify_owner after insert on public.customer_chat_messages
for each row execute function public.customer_chat_notify_owner();
commit;
select '고객 채팅 관리자 알림 설정 완료' as result;
