-- Only future committed changes create events; existing sites are not backfilled.
create schema if not exists app_private;
create table public.customer_schedule_alerts (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 site_id uuid not null references public.sites(id) on delete cascade,
 old_dates date[] not null, new_dates date[] not null,
 status text not null default 'pending' check(status in ('pending','reserved','requested','unknown','rejected','superseded','expired')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default now()+interval '24 hours'
);
create index customer_schedule_alert_pending on public.customer_schedule_alerts(id) where status='pending';
create unique index customer_schedule_alert_site_pending on public.customer_schedule_alerts(company_id,site_id) where status='pending';
alter table public.customer_schedule_alerts enable row level security;
revoke all on public.customer_schedule_alerts from public,anon,authenticated;
grant select,insert,update,delete on public.customer_schedule_alerts to service_role;

-- Match workDates(): explicit dates win; otherwise expand the KST range (max 366 days).
create function app_private.customer_schedule_dates(p_days date[],p_start timestamptz,p_end timestamptz,p_date date)
returns date[] language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct d order by d),'{}'::date[]) from (
  select unnest(p_days) d where p_days is not null
  union all
  select d::date from generate_series(coalesce((p_start at time zone 'Asia/Seoul')::date,p_date)::timestamp,
   least(coalesce((p_end at time zone 'Asia/Seoul')::date,(p_start at time zone 'Asia/Seoul')::date,p_date),
   coalesce((p_start at time zone 'Asia/Seoul')::date,p_date)+365)::timestamp,interval '1 day') d where p_days is null
 ) days where d is not null;
$$;
revoke all on function app_private.customer_schedule_dates(date[],timestamptz,timestamptz,date) from public,anon,authenticated;
grant usage on schema app_private to service_role;
grant execute on function app_private.customer_schedule_dates(date[],timestamptz,timestamptz,date) to service_role;

-- Snapshot once per transaction so a rollback, reordering or temporary edit cannot send.
create table app_private.customer_schedule_snapshots (
 tx bigint not null, company_id uuid not null, site_id uuid not null,
 old_status text, old_dates date[] not null, primary key(tx,company_id,site_id)
);
alter table app_private.customer_schedule_snapshots enable row level security;
revoke all on app_private.customer_schedule_snapshots from public,anon,authenticated;
create function app_private.capture_customer_schedule() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.work_dates is not distinct from new.work_dates and old.schedule_start is not distinct from new.schedule_start
 and old.schedule_end is not distinct from new.schedule_end and old.schedule_date is not distinct from new.schedule_date
 and old.status is not distinct from new.status then return new; end if;
 insert into app_private.customer_schedule_snapshots(tx,company_id,site_id,old_status,old_dates)
 values(txid_current(),old.company_id,old.id,old.status,
 app_private.customer_schedule_dates(old.work_dates,old.schedule_start,old.schedule_end,old.schedule_date)) on conflict do nothing;
 return new;
end;$$;
revoke all on function app_private.capture_customer_schedule() from public,anon,authenticated;
create function app_private.finish_customer_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare snap record;s public.sites%rowtype;days date[];
begin
 delete from app_private.customer_schedule_snapshots where tx=new.tx and company_id=new.company_id and site_id=new.site_id returning * into snap;
 if not found then return null;end if;
 select * into s from public.sites where id=snap.site_id and company_id=snap.company_id;
 if not found then return null;end if;
 days:=app_private.customer_schedule_dates(s.work_dates,s.schedule_start,s.schedule_end,s.schedule_date);
 if s.status not in ('scheduled','in_progress') or cardinality(days)=0 or days[cardinality(days)]<(now() at time zone 'Asia/Seoul')::date then
  update public.customer_schedule_alerts set status='superseded' where company_id=s.company_id and site_id=s.id and status='pending';
  return null;
 end if;
 if snap.old_status not in ('scheduled','in_progress') or cardinality(snap.old_dates)=0 or snap.old_dates=days then return null;end if;
 update public.customer_schedule_alerts set status='superseded' where company_id=s.company_id and site_id=s.id and status='pending';
 insert into public.customer_schedule_alerts(company_id,site_id,old_dates,new_dates) values(s.company_id,s.id,snap.old_dates,days);
 return null;
end;$$;
revoke all on function app_private.finish_customer_schedule() from public,anon,authenticated;
create trigger capture_customer_schedule before update on public.sites for each row execute function app_private.capture_customer_schedule();
create constraint trigger finish_customer_schedule after insert on app_private.customer_schedule_snapshots deferrable initially deferred for each row execute function app_private.finish_customer_schedule();

alter table public.alimtalk_deliveries add column customer_schedule_alert_id uuid references public.customer_schedule_alerts(id);
create unique index alimtalk_customer_schedule_alert_once on public.alimtalk_deliveries(customer_schedule_alert_id) where customer_schedule_alert_id is not null;
create function public.reserve_customer_schedule_alert(p_event uuid,p_id uuid,p_company uuid,p_site uuid,p_actor uuid,p_dates date[],p_phone text,p_mask text,p_template text,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.customer_schedule_alerts%rowtype;s public.sites%rowtype;a public.alimtalk_accounts%rowtype;days date[];phone text;free boolean;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_id is null or p_mask is null or p_template is null then raise exception 'invalid alert';end if;
 if p_actor is not null and not exists(select 1 from public.profiles where id=p_actor and company_id=p_company and role='owner' and is_active=true) then raise exception 'forbidden' using errcode='42501';end if;
 select * into s from public.sites where id=p_site and company_id=p_company for share;
 if not found then return jsonb_build_object('accepted',false,'reason','inactive');end if;
 select * into e from public.customer_schedule_alerts where id=p_event and company_id=p_company and site_id=p_site for update;
 if not found or e.status<>'pending' then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 if e.expires_at<=now() then update public.customer_schedule_alerts set status='expired' where id=e.id;return jsonb_build_object('accepted',false,'reason','stale');end if;
 days:=app_private.customer_schedule_dates(s.work_dates,s.schedule_start,s.schedule_end,s.schedule_date);
 if s.status not in ('scheduled','in_progress') or days<>e.new_dates or cardinality(days)=0 or days[cardinality(days)]<(now() at time zone 'Asia/Seoul')::date then
  update public.customer_schedule_alerts set status='superseded' where id=e.id;return jsonb_build_object('accepted',false,'reason','stale');
 end if;
 phone:=regexp_replace(coalesce(s.customer_phone,''),'[[:space:]()-]','','g');
 if left(phone,3)='+82' then phone:='0'||substr(phone,4);end if;
 if p_dates is distinct from days or p_phone is distinct from phone or phone !~ '^01[016789][0-9]{7,8}$' then return jsonb_build_object('accepted',false,'reason','stale');end if;
 if not exists(select 1 from public.companies where id=p_company and is_active=true) then return jsonb_build_object('accepted',false,'reason','inactive');end if;
 select * into a from public.alimtalk_accounts where company_id=p_company for update;
 if not found or not a.enabled then return jsonb_build_object('accepted',false,'reason','disabled');end if;
 if exists(select 1 from public.alimtalk_deliveries where id=p_id or customer_schedule_alert_id=e.id) then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 -- A manual/initial notice may have already sent this exact new schedule after the edit.
 if exists(select 1 from public.alimtalk_deliveries where company_id=p_company and site_id=p_site and kind='customer_schedule'
  and created_at>=e.created_at and content_hash=p_hash and status not in ('failed','rejected','canceled')) then
  update public.customer_schedule_alerts set status='superseded' where id=e.id;return jsonb_build_object('accepted',false,'reason','duplicate');
 end if;
 free:=p_company='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid;
 if not free and a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient');end if;
 -- A new committed schedule is distinct from an earlier message whose receipt is still pending.
 insert into public.alimtalk_deliveries(id,company_id,site_id,kind,recipient_mask,template_code,content_hash,created_by,credit_exempt,customer_schedule_alert_id)
 values(p_id,p_company,p_site,'customer_schedule',p_mask,p_template,p_hash,p_actor,free,e.id);
 update public.alimtalk_accounts set available_count=available_count-case when free then 0 else 1 end,updated_at=now() where company_id=p_company;
 update public.customer_schedule_alerts set status='reserved' where id=e.id;
 return jsonb_build_object('accepted',true);
end;$$;
revoke all on function public.reserve_customer_schedule_alert(uuid,uuid,uuid,uuid,uuid,date[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_customer_schedule_alert(uuid,uuid,uuid,uuid,uuid,date[],text,text,text,text) to service_role;
