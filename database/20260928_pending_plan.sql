-- Apply before activating plan downgrade billing.
alter table public.subscriptions
  add column if not exists pending_plan_code text;
