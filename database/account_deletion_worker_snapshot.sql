alter table public.account_deletion_requests
 add column if not exists worker_ids uuid[] not null default '{}';
