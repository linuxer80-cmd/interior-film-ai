-- A worker's report and its notification are saved in the same transaction.
-- The existing notifications trigger sends the push after commit.
create or replace function app_private.notify_worker_report_submitted()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_site_name text;
  v_worker_name text;
begin
  if new.review_status <> 'pending' or new.worker_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.review_status is distinct from 'rejected' then
    return new;
  end if;

  -- Do not notify on administrator-entered reports or mismatched companies.
  select s.site_name, w.name into v_site_name, v_worker_name
  from public.sites s
  join public.workers w on w.id = new.worker_id and w.company_id = new.company_id
  where s.id = new.site_id and s.company_id = new.company_id
    and w.user_id = new.created_by;
  if not found then return new; end if;

  insert into public.notifications (
    company_id, recipient_type, type, priority, title, message, link,
    reference_type, reference_id
  ) values (
    new.company_id, 'company_admin', 'worker_report_submitted', 'info',
    '시공 완료보고가 도착했습니다',
    coalesce(nullif(btrim(v_site_name), ''), '현장') || ' · ' ||
      coalesce(nullif(btrim(v_worker_name), ''), '시공자') || '님이 완료보고를 제출했습니다.',
    '/admin?tab=sites&site=' || new.site_id::text || '&section=report',
    'site', new.site_id::text
  );
  return new;
end;
$$;

revoke all on function app_private.notify_worker_report_submitted() from public, anon, authenticated;

drop trigger if exists notify_worker_report_submitted on public.work_reports;
create trigger notify_worker_report_submitted
after insert or update of review_status on public.work_reports
for each row execute function app_private.notify_worker_report_submitted();
