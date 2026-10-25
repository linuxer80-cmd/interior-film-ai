-- Apply after the site Alimtalk and operator-company schema changes.
create unique index if not exists alimtalk_worker_reminder_once on public.alimtalk_deliveries(company_id,site_id,worker_id,reminder_work_date) where kind='worker_reminder';
create or replace function public.reserve_worker_reminder(p_id uuid,p_company uuid,p_site uuid,p_worker uuid,p_work_date date,p_mask text,p_template text,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.alimtalk_accounts%rowtype;s public.sites%rowtype;first_day date;last_day date;free boolean:=p_company='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid;
begin
 if p_id is null or p_worker is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_work_date is null or p_mask is null or p_template is null then raise exception 'invalid reminder' using errcode='22023';end if;
 select * into s from public.sites where id=p_site and company_id=p_company for share;
 if not found or s.status not in ('scheduled','in_progress') or not exists(select 1 from public.companies where id=p_company and is_active=true) then return jsonb_build_object('accepted',false,'reason','inactive');end if;
 perform 1 from public.workers where id=p_worker and company_id=p_company and is_active=true for share;
 if not found then return jsonb_build_object('accepted',false,'reason','inactive');end if;
 if p_work_date<>((now() at time zone 'Asia/Seoul')::date+1) then return jsonb_build_object('accepted',false,'reason','stale');end if;
 if s.work_dates is not null then
  if not coalesce(p_work_date=any(s.work_dates),false) then return jsonb_build_object('accepted',false,'reason','stale');end if;
 else
  first_day:=coalesce((s.schedule_start at time zone 'Asia/Seoul')::date,s.schedule_date);
  last_day:=coalesce((s.schedule_end at time zone 'Asia/Seoul')::date,first_day);
  if first_day is null or p_work_date<first_day or p_work_date>last_day then return jsonb_build_object('accepted',false,'reason','stale');end if;
 end if;
 if exists(select 1 from public.site_daily_assignments where company_id=p_company and site_id=p_site) then
  perform 1 from public.site_daily_assignments where company_id=p_company and site_id=p_site and worker_id=p_worker and work_date=p_work_date for share;
 else
  perform 1 from public.site_workers where company_id=p_company and site_id=p_site and worker_id=p_worker for share;
 end if;
 if not found then return jsonb_build_object('accepted',false,'reason','stale');end if;
 select * into a from public.alimtalk_accounts where company_id=p_company for update;
 if not found or not a.enabled then return jsonb_build_object('accepted',false,'reason','disabled');end if;
 if exists(select 1 from public.alimtalk_deliveries where id=p_id or (company_id=p_company and site_id=p_site and worker_id=p_worker and kind='worker_reminder' and reminder_work_date=p_work_date)) then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 if not free and a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient');end if;
 insert into public.alimtalk_deliveries(id,company_id,site_id,worker_id,kind,recipient_mask,template_code,content_hash,reminder_work_date,credit_exempt) values(p_id,p_company,p_site,p_worker,'worker_reminder',p_mask,p_template,p_hash,p_work_date,free);
 update public.alimtalk_accounts set available_count=available_count-case when free then 0 else 1 end,updated_at=now() where company_id=p_company;
 return jsonb_build_object('accepted',true);
end;$$;
revoke all on function public.reserve_worker_reminder(uuid,uuid,uuid,uuid,date,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_worker_reminder(uuid,uuid,uuid,uuid,date,text,text,text) to service_role;
