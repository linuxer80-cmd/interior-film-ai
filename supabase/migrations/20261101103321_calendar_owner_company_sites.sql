-- Keep owner calendars current when company sites, materials, or access change.
create or replace function app_private.calendar_auto_enqueue_site(p_site uuid,p_company uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare ids uuid[];
begin
  select array_agg(p.id) into ids from public.profiles p
  where p.company_id=p_company and p.role='owner' and p.is_active is distinct from false;
  perform app_private.calendar_auto_enqueue(ids);
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
    elsif TG_TABLE_NAME='profiles' and
      (a->>'is_active',a->>'role',a->>'company_id') is not distinct from
      (b->>'is_active',b->>'role',b->>'company_id') then return null;
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
      select array_agg(id) into ids from public.profiles
      where company_id=(r->>'id')::uuid and role='owner';
      perform app_private.calendar_auto_enqueue(ids);
    end if;
  end loop;
  return null;
end;
$$;

-- Run only after the application with owner-scoped export is live.
update public.calendar_auto_connections c
set dirty_version=c.dirty_version+1,next_run_at=least(c.next_run_at,now())
where c.enabled and not c.needs_reconnect and exists (
  select 1 from public.profiles p where p.id=c.user_id and p.role='owner'
    and p.company_id is not null and p.is_active is distinct from false
);
