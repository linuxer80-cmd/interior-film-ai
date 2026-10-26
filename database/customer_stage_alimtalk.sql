create unique index if not exists alimtalk_customer_stage_once on public.alimtalk_deliveries(company_id,site_id,kind) where kind in ('customer_portal_before','customer_portal_complete','customer_portal_care');
create or replace function public.reserve_customer_stage(p_id uuid,p_company uuid,p_site uuid,p_actor uuid,p_stage text,p_mask text,p_template text,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.alimtalk_accounts%rowtype;s public.sites%rowtype;free boolean:=p_company='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid;last_day date;paid numeric;confirmed boolean;
begin
 if p_stage is null or p_stage not in ('before','complete','care') or p_id is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_template is null or p_mask is null then raise exception 'invalid stage';end if;
 if not exists(select 1 from public.profiles where id=p_actor and company_id=p_company and role='owner' and is_active=true) then raise exception 'forbidden' using errcode='42501';end if;
 select * into s from public.sites where id=p_site and company_id=p_company for share;
 if not found or s.status not in ('scheduled','in_progress','completed') or not exists(select 1 from public.companies where id=p_company and is_active=true) then return jsonb_build_object('accepted',false,'reason','inactive');end if;
 select max(d) into last_day from unnest(s.work_dates) d;
 last_day:=coalesce(last_day,(s.schedule_end at time zone 'Asia/Seoul')::date,(s.schedule_start at time zone 'Asia/Seoul')::date,s.schedule_date);
 if p_stage='before' and(s.status='completed' or last_day is null) then return jsonb_build_object('accepted',false,'reason','stale');end if;
 if p_stage in ('complete','care') then
  if last_day>(now() at time zone 'Asia/Seoul')::date or not exists(select 1 from public.work_reports where company_id=p_company and site_id=p_site and review_status='approved' and reviewed_at is not null) or exists(select 1 from public.work_reports where company_id=p_company and site_id=p_site and(review_status is distinct from 'approved' or reviewed_at is null)) then return jsonb_build_object('accepted',false,'reason','stale');end if;
 end if;
 if p_stage='care' then
  select b.paid,b.confirmed into paid,confirmed from public.site_receivable_balances b where b.company_id=p_company and b.id=p_site;
  if not coalesce(confirmed,false) or s.contract_amount is null or s.contract_amount<=0 or paid is null or paid<s.contract_amount then return jsonb_build_object('accepted',false,'reason','stale');end if;
 end if;
 select * into a from public.alimtalk_accounts where company_id=p_company for update;
 if not found or not a.enabled then return jsonb_build_object('accepted',false,'reason','disabled');end if;
 if exists(select 1 from public.alimtalk_deliveries where id=p_id or(company_id=p_company and site_id=p_site and(kind='customer_portal_'||p_stage or(p_stage='complete' and kind='customer_completion')))) then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 if not free and a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient');end if;
 insert into public.alimtalk_deliveries(id,company_id,site_id,kind,recipient_mask,template_code,content_hash,created_by,credit_exempt) values(p_id,p_company,p_site,'customer_portal_'||p_stage,p_mask,p_template,p_hash,p_actor,free);
 update public.alimtalk_accounts set available_count=available_count-case when free then 0 else 1 end,updated_at=now() where company_id=p_company;
 return jsonb_build_object('accepted',true);
end;$$;
revoke all on function public.reserve_customer_stage(uuid,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_customer_stage(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;
