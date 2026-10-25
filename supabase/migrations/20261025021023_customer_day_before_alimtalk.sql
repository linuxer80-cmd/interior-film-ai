alter table public.alimtalk_deliveries add column if not exists reminder_work_date date;
create unique index if not exists alimtalk_customer_reminder_once on public.alimtalk_deliveries(company_id,site_id,reminder_work_date) where kind='customer_reminder';
create or replace function public.reserve_customer_reminder(p_id uuid,p_company uuid,p_site uuid,p_work_date date,p_mask text,p_template text,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.alimtalk_accounts%rowtype; s public.sites%rowtype; first_day date;
begin
 if p_hash is null or length(p_hash)<>64 or p_work_date is null then raise exception 'invalid reminder' using errcode='22023';end if;
 select * into s from public.sites where id=p_site and company_id=p_company for share;
 if not found or s.status not in ('scheduled','in_progress') or not exists(select 1 from public.companies where id=p_company and is_active=true) then return jsonb_build_object('accepted',false,'reason','inactive');end if;
 if s.work_dates is not null then select min(d) into first_day from unnest(s.work_dates) d;
 else first_day:=coalesce((s.schedule_start at time zone 'Asia/Seoul')::date,s.schedule_date);end if;
 if first_day is distinct from p_work_date or p_work_date<>((now() at time zone 'Asia/Seoul')::date+1) then return jsonb_build_object('accepted',false,'reason','stale');end if;
 select * into a from public.alimtalk_accounts where company_id=p_company for update;
 if not found or not a.enabled then return jsonb_build_object('accepted',false,'reason','disabled');end if;
 if exists(select 1 from public.alimtalk_deliveries where id=p_id or (company_id=p_company and site_id=p_site and kind='customer_reminder' and reminder_work_date=p_work_date)) then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 if a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient');end if;
 insert into public.alimtalk_deliveries(id,company_id,site_id,kind,recipient_mask,template_code,content_hash,reminder_work_date) values(p_id,p_company,p_site,'customer_reminder',p_mask,p_template,p_hash,p_work_date);
 update public.alimtalk_accounts set available_count=available_count-1,updated_at=now() where company_id=p_company;
 return jsonb_build_object('accepted',true);
end;$$;
revoke all on function public.reserve_customer_reminder(uuid,uuid,uuid,date,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_customer_reminder(uuid,uuid,uuid,date,text,text,text) to service_role;
