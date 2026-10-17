begin;
alter table public.customer_chat_messages add column if not exists image_path text;
alter table public.customer_chat_messages drop constraint if exists customer_chat_messages_body_check;
alter table public.customer_chat_messages add constraint customer_chat_messages_body_check
 check(char_length(body)<=2000 and (char_length(btrim(body))>0 or image_path is not null));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('customer-chat','customer-chat',false,2097152,array['image/jpeg'])
 on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg'];
-- Block any broad existing storage policy from exposing chat photos to browser clients.
drop policy if exists customer_chat_private_photos on storage.objects;
create policy customer_chat_private_photos on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id <> 'customer-chat') with check(bucket_id <> 'customer-chat');
create or replace function public.customer_chat_message_saved() returns trigger
language plpgsql security invoker set search_path='' as $$
declare t public.customer_chat_threads%rowtype;
begin
 select * into t from public.customer_chat_threads where id=new.thread_id for update;
 if not found then raise exception '대화를 찾을 수 없습니다.'; end if;
 if new.sender='customer' and t.last_customer_at > clock_timestamp()-interval '2 seconds' then
   raise exception '잠시 후 다시 보내주세요.';
 end if;
 update public.customer_chat_threads set updated_at=new.created_at,
   last_preview=case when new.image_path is not null then '사진 · ' || left(new.body,110) else left(new.body,120) end,
   last_customer_at=case when new.sender='customer' then new.created_at else last_customer_at end,
   last_owner_at=case when new.sender='owner' then new.created_at else last_owner_at end
 where id=new.thread_id;
 return new;
end $$;
revoke all on function public.customer_chat_message_saved() from public,anon,authenticated;
grant execute on function public.customer_chat_message_saved() to service_role;
commit;
select '고객 채팅 사진 전송 설정 완료' as result;
