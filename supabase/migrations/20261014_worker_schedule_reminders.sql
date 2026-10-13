-- Run once in Supabase SQL Editor before enabling the reminder cron.
create table if not exists public.worker_schedule_reminders (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 site_id uuid not null,
 worker_id uuid not null,
 user_id uuid not null,
 work_date date not null,
 status text not null default 'pending' check (status in ('pending','sent','failed','no_subscription')),
 attempts integer not null default 0,
 sent_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (company_id,site_id,worker_id,work_date)
);
create index if not exists worker_schedule_reminders_status_idx
 on public.worker_schedule_reminders(work_date,status);
alter table public.worker_schedule_reminders enable row level security;
-- No client-side policies: only service_role can read/write reminder delivery state.
revoke all on public.worker_schedule_reminders from anon,authenticated;
grant all on public.worker_schedule_reminders to service_role;
