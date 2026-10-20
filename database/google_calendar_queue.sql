-- Apply after google_calendar_auto.sql. Existing connections are queued once.
begin;
alter table public.calendar_auto_connections
  add column if not exists dirty_version bigint not null default 1,
  add column if not exists synced_version bigint not null default 0;

create or replace function public.calendar_auto_claim(p_user uuid default null)
returns setof public.calendar_auto_connections
language sql security invoker set search_path = '' as $$
  update public.calendar_auto_connections c
  set lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes'
  where c.user_id=(
    select x.user_id from public.calendar_auto_connections x
    where x.enabled and not x.needs_reconnect
      and x.next_run_at<=now()
      and (p_user is null or x.user_id=p_user)
      and (x.lease_until is null or x.lease_until<now())
    order by x.next_run_at,x.user_id
    for update skip locked limit 1
  ) returning c.*;
$$;

-- Completing version N must not erase a change N+1 arriving during sync.
create or replace function public.calendar_auto_complete(
  p_user uuid,p_generation uuid,p_lease uuid,p_version bigint
) returns boolean
language sql security invoker set search_path = '' as $$
  with saved as (
    update public.calendar_auto_connections
    set synced_version=p_version,last_sync_at=now(),last_error=null,
        next_run_at=case when dirty_version>p_version
          then now() else now()+interval '1 day' end,
        lease_id=null,lease_until=null
    where user_id=p_user and generation=p_generation and lease_id=p_lease
      and enabled and not needs_reconnect and lease_until>now()
    returning user_id
  ) select exists(select 1 from saved);
$$;
revoke all on function public.calendar_auto_claim(uuid),
  public.calendar_auto_complete(uuid,uuid,uuid,bigint)
  from public,anon,authenticated;
grant execute on function public.calendar_auto_claim(uuid),
  public.calendar_auto_complete(uuid,uuid,uuid,bigint) to service_role;

create schema if not exists app_private;
-- Private helpers are only invoked from the trigger below, never from clients.
create or replace function app_private.calendar_auto_enqueue(p_users uuid[])
returns void language sql security invoker set search_path = '' as $$
  update public.calendar_auto_connections
  set dirty_version=dirty_version+1,next_run_at=least(next_run_at,now())
  where user_id=any(p_users) and enabled and not needs_reconnect;
$$;
create or replace function app_private.calendar_auto_enqueue_site(p_site uuid,p_company uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare ids uuid[];
begin
  select array_agg(distinct w.user_id) into ids
  from public.workers w join public.site_workers a on a.worker_id=w.id
  where a.site_id=p_site and a.company_id=p_company
    and w.company_id=p_company and w.user_id is not null;
  perform app_private.calendar_auto_enqueue(ids);
  if to_regclass('public.site_daily_assignments') is not null then
    select array_agg(distinct w.user_id) into ids
    from public.workers w join public.site_daily_assignments a on a.worker_id=w.id
    where a.site_id=p_site and a.company_id=p_company
      and w.company_id=p_company and w.user_id is not null;
    perform app_private.calendar_auto_enqueue(ids);
  end if;
end;
$$;
-- Trigger-only definer: clients cannot call it, choose recipients or read tokens.
-- Runs only AFTER writes already authorized by each source table's RLS/RPC.
create or replace function app_private.calendar_auto_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a jsonb; b jsonb; r jsonb; ids uuid[];
begin
  if TG_OP<>'INSERT' then a=to_jsonb(OLD); end if;
  if TG_OP<>'DELETE' then b=to_jsonb(NEW); end if;
  if TG_OP='UPDATE' then
    if TG_TABLE_NAME='sites' and
      (a->>'site_name',a->>'address',a->>'address_detail',a->>'memo',a->>'work_type',a->>'work_description',a->>'status',a->>'schedule_start',a->>'schedule_end',a->'work_dates',a->>'company_id')
      is not distinct from
      (b->>'site_name',b->>'address',b->>'address_detail',b->>'memo',b->>'work_type',b->>'work_description',b->>'status',b->>'schedule_start',b->>'schedule_end',b->'work_dates',b->>'company_id') then return null;
    elsif TG_TABLE_NAME='site_materials' and
      (a->>'site_id',a->>'company_id',a->>'material_type',a->>'brand',a->>'product_code',a->>'product_name',a->>'price_type',a->>'memo')
      is not distinct from
      (b->>'site_id',b->>'company_id',b->>'material_type',b->>'brand',b->>'product_code',b->>'product_name',b->>'price_type',b->>'memo') then return null;
    elsif TG_TABLE_NAME='workers' and
      (a->>'user_id',a->>'company_id',a->>'is_active') is not distinct from
      (b->>'user_id',b->>'company_id',b->>'is_active') then return null;
    elsif TG_TABLE_NAME='profiles' and a->>'is_active' is not distinct from b->>'is_active' then return null;
    elsif TG_TABLE_NAME='companies' and
      (a->>'company_name',a->>'is_active') is not distinct from
      (b->>'company_name',b->>'is_active') then return null;
    elsif TG_TABLE_NAME in ('site_workers','site_daily_assignments') and
      (a->>'site_id',a->>'company_id',a->>'worker_id',a->>'role',a->>'work_date') is not distinct from
      (b->>'site_id',b->>'company_id',b->>'worker_id',b->>'role',b->>'work_date') then return null;
    end if;
  end if;
  -- Both old and new identities are needed when a worker/date/site is removed.
  for r in select v from (values(a),(b)) as t(v) where v is not null loop
    if TG_TABLE_NAME='sites' then
      perform app_private.calendar_auto_enqueue_site((r->>'id')::uuid,(r->>'company_id')::uuid);
    elsif TG_TABLE_NAME='site_materials' then
      if r->>'material_type'='planned' then
        perform app_private.calendar_auto_enqueue_site((r->>'site_id')::uuid,(r->>'company_id')::uuid);
      end if;
    elsif TG_TABLE_NAME in ('site_workers','site_daily_assignments') then
      perform app_private.calendar_auto_enqueue_site((r->>'site_id')::uuid,(r->>'company_id')::uuid);
      select array_agg(user_id) into ids from public.workers
      where id=(r->>'worker_id')::uuid and company_id=(r->>'company_id')::uuid;
      perform app_private.calendar_auto_enqueue(ids);
    elsif TG_TABLE_NAME='workers' then
      perform app_private.calendar_auto_enqueue(array[(r->>'user_id')::uuid]);
    elsif TG_TABLE_NAME='profiles' then
      perform app_private.calendar_auto_enqueue(array[(r->>'id')::uuid]);
    elsif TG_TABLE_NAME='companies' then
      select array_agg(distinct user_id) into ids from public.workers
      where company_id=(r->>'id')::uuid and user_id is not null;
      perform app_private.calendar_auto_enqueue(ids);
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function app_private.calendar_auto_enqueue(uuid[]),
  app_private.calendar_auto_enqueue_site(uuid,uuid),
  app_private.calendar_auto_changed() from public,anon,authenticated,service_role;

do $$ declare t text; begin
  foreach t in array array['sites','site_materials','site_workers',
    'site_daily_assignments','workers','profiles','companies'] loop
    if to_regclass('public.'||t) is not null then
      if t in ('site_workers','site_daily_assignments') then
        execute format('create index if not exists %I on public.%I(company_id,site_id,worker_id)','calendar_lookup_'||t,t);
      end if;
      execute format('drop trigger if exists calendar_auto_queue on public.%I',t);
      execute format('create trigger calendar_auto_queue after insert or update or delete on public.%I for each row execute function app_private.calendar_auto_changed()',t);
    end if;
  end loop;
end $$;
-- Re-running this setup deliberately schedules one reconciliation for each connection.
update public.calendar_auto_connections
set dirty_version=dirty_version+1,next_run_at=now();
commit;
select '변경된 사용자만 동기화 · 하루 한 번 누락 점검 설정 완료' as result;
