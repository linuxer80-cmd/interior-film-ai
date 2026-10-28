-- Keep the existing five-minute scheduler and let it wake the app only when
-- a sync is claimable or the existing OAuth cleanup has expired work.
do $migration$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id
    from cron.job
   where jobname = 'calendar-auto-sync' and schedule = '*/5 * * * *' and active;
  if existing_job_id is null then
    raise exception 'Active five-minute calendar-auto-sync job not found; existing configuration left unchanged';
  end if;
  perform cron.alter_job(job_id := existing_job_id, command := $command$
    select net.http_post(
      url := 'https://interior-film-ai.vercel.app/api/calendar/auto/cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
           where name = 'calendar_auto_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 280000
    )
    where exists (
      select 1 from public.calendar_auto_connections c
       where c.enabled and not c.needs_reconnect
         and c.next_run_at <= now()
         and (c.lease_until is null or c.lease_until < now())
    ) or exists (
      select 1 from public.calendar_auto_pending p where p.expires_at < now()
    );
  $command$);
end
$migration$;
