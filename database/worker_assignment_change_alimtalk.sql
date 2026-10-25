-- Transaction-level before/after snapshots avoid notifications for transient delete/insert rows.
create schema if not exists app_private;
create table if not exists public.worker_assignment_alerts(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),site_id uuid not null references public.sites(id) on delete cascade,
 worker_id uuid not null references public.workers(id),kind text not null check(kind in ('worker_schedule_changed','worker_canceled')),
 old_dates jsonb not null,new_dates jsonb not null,removed_dates jsonb not null,
 status text not null default 'pending' check(status in ('pending','reserved','requested','unknown','rejected','superseded','expired')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours'
);
create index if not exists worker_assignment_alert_pending on public.worker_assignment_alerts(created_at,id) where status='pending';
create index if not exists worker_assignment_alert_site_pending on public.worker_assignment_alerts(company_id,site_id,worker_id) where status='pending';
alter table public.worker_assignment_alerts enable row level security;
revoke all on public.worker_assignment_alerts from public,anon,authenticated;
grant select,insert,update,delete on public.worker_assignment_alerts to service_role;
create table if not exists app_private.worker_alert_snapshots(tx bigint not null,company_id uuid not null,site_id uuid not null,before_state jsonb not null,primary key(tx,company_id,site_id));
alter table app_private.worker_alert_snapshots enable row level security;
revoke all on app_private.worker_alert_snapshots from public,anon,authenticated;

create or replace function app_private.worker_alert_state(p_company uuid,p_site uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with s as(select * from public.sites where id=p_site and company_id=p_company and status in ('scheduled','in_progress')),
 days as(
 select d::date as work_day from s cross join lateral unnest(s.work_dates) d where s.work_dates is not null
 union all
 select d::date from s cross join lateral generate_series(coalesce((s.schedule_start at time zone 'Asia/Seoul')::date,s.schedule_date)::timestamp,
 least(coalesce((s.schedule_end at time zone 'Asia/Seoul')::date,(s.schedule_start at time zone 'Asia/Seoul')::date,s.schedule_date),coalesce((s.schedule_start at time zone 'Asia/Seoul')::date,s.schedule_date)+365)::timestamp,interval '1 day') d where s.work_dates is null),
 assigned as(
 select a.worker_id,a.work_date as work_day from public.site_daily_assignments a join days d on d.work_day=a.work_date where a.site_id=p_site and a.company_id=p_company
 union
 select a.worker_id,d.work_day from public.site_workers a cross join days d where a.site_id=p_site and a.company_id=p_company and not exists(select 1 from public.site_daily_assignments x where x.site_id=p_site and x.company_id=p_company)),
 grouped as(select worker_id,jsonb_agg(work_day order by work_day) dates from assigned where work_day>=(now() at time zone 'Asia/Seoul')::date group by worker_id)
 select coalesce(jsonb_object_agg(worker_id::text,dates),'{}'::jsonb) from grouped;
$$;
revoke all on function app_private.worker_alert_state(uuid,uuid) from public,anon,authenticated;

create or replace function app_private.capture_worker_alert_state() returns trigger language plpgsql security definer set search_path='' as $$
declare co uuid;si uuid;
begin
 if tg_table_name='sites' then
  if old.work_dates is not distinct from new.work_dates and old.schedule_start is not distinct from new.schedule_start and old.schedule_end is not distinct from new.schedule_end and old.schedule_date is not distinct from new.schedule_date and old.status is not distinct from new.status then return new;end if;
  co:=old.company_id;si:=old.id;
 else
  if tg_op='DELETE' then co:=old.company_id;si:=old.site_id;else co:=new.company_id;si:=new.site_id;end if;
 end if;
 perform 1 from public.sites where id=si and company_id=co for update;
 if found and not exists(select 1 from app_private.worker_alert_snapshots where tx=txid_current() and company_id=co and site_id=si) then insert into app_private.worker_alert_snapshots(tx,company_id,site_id,before_state) values(txid_current(),co,si,app_private.worker_alert_state(co,si)) on conflict do nothing;end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function app_private.capture_worker_alert_state() from public,anon,authenticated;
create or replace function app_private.finish_worker_alert_state() returns trigger language plpgsql security definer set search_path='' as $$
declare snap record;current_state jsonb;w text;old_days jsonb;new_days jsonb;removed jsonb;added jsonb;k text;
begin
 delete from app_private.worker_alert_snapshots where tx=new.tx and company_id=new.company_id and site_id=new.site_id returning * into snap;
 if not found then return null;end if;
 if not exists(select 1 from public.sites where id=snap.site_id and company_id=snap.company_id and status in ('scheduled','in_progress','cancelled','canceled')) then return null;end if;
 current_state:=app_private.worker_alert_state(snap.company_id,snap.site_id);
 for w,old_days in select key,value from jsonb_each(snap.before_state) loop
  new_days:=coalesce(current_state->w,'[]'::jsonb);
  if old_days=new_days then continue;end if;
  select coalesce(jsonb_agg(d order by d),'[]'::jsonb) into removed from jsonb_array_elements_text(old_days) d where not new_days ? d;
  select coalesce(jsonb_agg(d order by d),'[]'::jsonb) into added from jsonb_array_elements_text(new_days) d where not old_days ? d;
  k:=case when added='[]'::jsonb then 'worker_canceled' else 'worker_schedule_changed' end;
  update public.worker_assignment_alerts set status='superseded' where company_id=snap.company_id and site_id=snap.site_id and worker_id=w::uuid and status='pending';
  insert into public.worker_assignment_alerts(company_id,site_id,worker_id,kind,old_dates,new_dates,removed_dates) values(snap.company_id,snap.site_id,w::uuid,k,old_days,new_days,removed);
 end loop;
 return null;
end;$$;
revoke all on function app_private.finish_worker_alert_state() from public,anon,authenticated;
drop trigger if exists finish_worker_alert_snapshot on app_private.worker_alert_snapshots;
create constraint trigger finish_worker_alert_snapshot after insert on app_private.worker_alert_snapshots deferrable initially deferred for each row execute function app_private.finish_worker_alert_state();
drop trigger if exists aaa_capture_worker_alert on public.sites;
create trigger aaa_capture_worker_alert before update on public.sites for each row execute function app_private.capture_worker_alert_state();
drop trigger if exists aaa_capture_worker_alert on public.site_daily_assignments;
create trigger aaa_capture_worker_alert before insert or update or delete on public.site_daily_assignments for each row execute function app_private.capture_worker_alert_state();
drop trigger if exists aaa_capture_worker_alert on public.site_workers;
create trigger aaa_capture_worker_alert before insert or update or delete on public.site_workers for each row execute function app_private.capture_worker_alert_state();

alter table public.alimtalk_deliveries add column if not exists assignment_alert_id uuid references public.worker_assignment_alerts(id);
create unique index if not exists alimtalk_assignment_alert_once on public.alimtalk_deliveries(assignment_alert_id) where assignment_alert_id is not null;
create or replace function public.reserve_worker_change_alert(p_event uuid,p_id uuid,p_mask text,p_template text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.worker_assignment_alerts%rowtype;a public.alimtalk_accounts%rowtype;state jsonb;free boolean;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_id is null or p_mask is null or p_template is null then raise exception 'invalid alert';end if;
 select * into e from public.worker_assignment_alerts where id=p_event;
 if not found then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 perform 1 from public.sites where id=e.site_id and company_id=e.company_id for share;
 select * into e from public.worker_assignment_alerts where id=p_event for update;
 if not found or e.status<>'pending' then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 if e.expires_at<=now() then update public.worker_assignment_alerts set status='expired' where id=e.id;return jsonb_build_object('accepted',false,'reason','stale');end if;
 if not exists(select 1 from public.companies where id=e.company_id and is_active=true) or not exists(select 1 from public.workers where id=e.worker_id and company_id=e.company_id and is_active=true) then return jsonb_build_object('accepted',false,'reason','inactive');end if;
 perform 1 from public.sites where id=e.site_id and company_id=e.company_id and status in ('scheduled','in_progress','cancelled','canceled') for share;
 if not found then update public.worker_assignment_alerts set status='superseded' where id=e.id;return jsonb_build_object('accepted',false,'reason','stale');end if;
 state:=app_private.worker_alert_state(e.company_id,e.site_id);
 if coalesce(state->e.worker_id::text,'[]'::jsonb)<>e.new_dates then update public.worker_assignment_alerts set status='superseded' where id=e.id;return jsonb_build_object('accepted',false,'reason','stale');end if;
 select * into a from public.alimtalk_accounts where company_id=e.company_id for update;
 if not found or not a.enabled then return jsonb_build_object('accepted',false,'reason','disabled');end if;
 free:=e.company_id='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid;
 if not free and a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient');end if;
 if exists(select 1 from public.alimtalk_deliveries where id=p_id or assignment_alert_id=e.id) then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 insert into public.alimtalk_deliveries(id,company_id,site_id,worker_id,kind,recipient_mask,template_code,content_hash,assignment_alert_id,credit_exempt) values(p_id,e.company_id,e.site_id,e.worker_id,e.kind,p_mask,p_template,p_hash,e.id,free);
 update public.alimtalk_accounts set available_count=available_count-case when free then 0 else 1 end,updated_at=now() where company_id=e.company_id;
 update public.worker_assignment_alerts set status='reserved' where id=e.id;
 return jsonb_build_object('accepted',true);
end;$$;
revoke all on function public.reserve_worker_change_alert(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_worker_change_alert(uuid,uuid,text,text,text) to service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.worker_alert_state(uuid,uuid) to service_role;
