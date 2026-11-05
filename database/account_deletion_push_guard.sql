-- Apply before wiring the verified deletion executor. A request alone must not
-- mark an account: only the server may start verified deletion processing.
begin;
create table if not exists public.account_deletion_blocks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table public.account_deletion_blocks enable row level security;
revoke all on public.account_deletion_blocks from anon, authenticated;
grant select on public.account_deletion_blocks to authenticated;
grant all on public.account_deletion_blocks to service_role;
drop policy if exists deletion_block_read_own on public.account_deletion_blocks;
create policy deletion_block_read_own on public.account_deletion_blocks
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_block_deleting_account on public.push_subscriptions;
create policy push_block_deleting_account on public.push_subscriptions
  as restrictive for all to authenticated
  using (not exists (select 1 from public.account_deletion_blocks d
    where d.user_id = (select auth.uid())))
  with check (not exists (select 1 from public.account_deletion_blocks d
    where d.user_id = (select auth.uid())));
commit;
