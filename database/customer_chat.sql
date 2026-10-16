begin;
create table if not exists public.customer_chat_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  visitor_hash text not null check(length(visitor_hash)=64),
  customer_name text not null check(char_length(customer_name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_preview text not null default '',
  last_customer_at timestamptz,
  last_owner_at timestamptz,
  owner_read_at timestamptz,
  unique(company_id,visitor_hash)
);
create table if not exists public.customer_chat_messages (
  id uuid primary key,
  thread_id uuid not null references public.customer_chat_threads(id) on delete cascade,
  sender text not null check(sender in ('customer','owner')),
  body text not null check(char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_chat_company_updated on public.customer_chat_threads(company_id,updated_at desc,id);
create index if not exists customer_chat_message_order on public.customer_chat_messages(thread_id,created_at desc,id);
alter table public.customer_chat_threads enable row level security;
alter table public.customer_chat_messages enable row level security;
revoke all on public.customer_chat_threads,public.customer_chat_messages from public,anon,authenticated;
grant select,insert,update,delete on public.customer_chat_threads,public.customer_chat_messages to service_role;
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
   last_preview=left(new.body,120),
   last_customer_at=case when new.sender='customer' then new.created_at else last_customer_at end,
   last_owner_at=case when new.sender='owner' then new.created_at else last_owner_at end
 where id=new.thread_id;
 return new;
end $$;
revoke all on function public.customer_chat_message_saved() from public,anon,authenticated;
grant execute on function public.customer_chat_message_saved() to service_role;
drop trigger if exists customer_chat_message_saved on public.customer_chat_messages;
create trigger customer_chat_message_saved before insert on public.customer_chat_messages
for each row execute function public.customer_chat_message_saved();
commit;
select '고객 채팅 설정 완료' as result;
