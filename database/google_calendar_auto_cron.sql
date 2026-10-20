-- 1. Enable pg_cron and pg_net in Supabase Database > Extensions.
-- 2. Vault > Secrets: create calendar_auto_cron_secret with the exact value of
--    Vercel's server-only CALENDAR_CRON_SECRET. Do not put the secret into this SQL file.
-- 3. Run google_calendar_auto.sql first, then this file.
do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='calendar_auto_cron_secret') then
    raise exception 'Vault에 calendar_auto_cron_secret을 먼저 등록해주세요.';
  end if;
end $$;
select cron.schedule(
  'calendar-auto-sync',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url:='https://interior-film-ai.vercel.app/api/calendar/auto/cron',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='calendar_auto_cron_secret')
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=280000
    );
  $job$
);
select jobname,schedule,active from cron.job where jobname='calendar-auto-sync';
-- HTTP 200 AND processed>0 AND the user's last_sync_at changing confirm an
-- actual sync. A cron.job_run_details success alone only confirms HTTP enqueue.
-- SELECT status_code,error_msg,content FROM net._http_response ORDER BY created DESC LIMIT 5;
-- SELECT user_id,last_sync_at,last_error,needs_reconnect FROM public.calendar_auto_connections;
