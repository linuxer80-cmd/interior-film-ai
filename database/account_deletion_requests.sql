begin;
create table if not exists public.account_deletion_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid unique references auth.users(id) on delete set null,
 status text not null default 'review_required'
   check(status in ('review_required','processing','failed','completed')),
 requested_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
grant all on public.account_deletion_requests to service_role;
commit;
