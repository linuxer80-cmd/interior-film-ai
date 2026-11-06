-- Server-managed tokens. Do not expose registration tokens to browser clients.
begin;
create table if not exists public.android_chat_push_tokens (
  device_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (length(token) between 20 and 4096),
  updated_at timestamptz not null default now()
);
-- Legacy clients are not assumed able to receive the new notification flows.
alter table public.android_chat_push_tokens add column if not exists native_chat_ready boolean not null default false;
alter table public.android_chat_push_tokens add column if not exists native_general_ready boolean not null default false;
create index if not exists android_chat_push_tokens_user_idx on public.android_chat_push_tokens(user_id);
alter table public.android_chat_push_tokens enable row level security;
revoke all on public.android_chat_push_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.android_chat_push_tokens to service_role;
commit;
