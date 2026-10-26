create unique index if not exists alimtalk_customer_completion_once on public.alimtalk_deliveries(company_id,site_id) where kind='customer_completion';
create or replace function public.reserve_customer_completion(p_id uuid,p_company uuid,p_site uuid,p_actor uuid,p_mask text,p_template text,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.alimtalk_accounts%rowtype;s public.sites%rowtype;free boolean:=p_company='2ddfe3d9-4411-4991-ae35-5b876be411bc'::uuid; last_day date;
begin
 if p_id is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_template is null or p_mask is null then raise exception 'invalid completion';end if;
 if not exists(select 1 from public.profiles where id=p_actor and company_id=p_company and role='owner' and is_active=true) then raise exception 'forbidden' using errcode='42501';end if;
 select * into s from public.sites where id=p_site and company_id=p_company for share;
 if not found or s.status not in ('scheduled','in_progress','completed') or not exists(select 1 from public.companies where id=p_company and is_active=true) then return jsonb_build_object('accepted',false,'reason','inactive');end if;
 if not exists(select 1 from public.work_reports where company_id=p_company and site_id=p_site and review_status='approved') or exists(select 1 from public.work_reports where company_id=p_company and site_id=p_site and review_status is distinct from 'approved') then return jsonb_build_object('accepted',false,'reason','stale');end if;
 select max(d) into last_day from unnest(s.work_dates) d;
 last_day:=coalesce(last_day,(s.schedule_end at time zone 'Asia/Seoul')::date,(s.schedule_start at time zone 'Asia/Seoul')::date,s.schedule_date);
 if last_day>(now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('accepted',false,'reason','stale');end if;
 select * into a from public.alimtalk_accounts where company_id=p_company for update;
 if not found or not a.enabled then return jsonb_build_object('accepted',false,'reason','disabled');end if;
 if exists(select 1 from public.alimtalk_deliveries where id=p_id or(company_id=p_company and site_id=p_site and kind='customer_completion')) then return jsonb_build_object('accepted',false,'reason','duplicate');end if;
 if not free and a.available_count<1 then return jsonb_build_object('accepted',false,'reason','insufficient');end if;
 insert into public.alimtalk_deliveries(id,company_id,site_id,kind,recipient_mask,template_code,content_hash,created_by,credit_exempt) values(p_id,p_company,p_site,'customer_completion',p_mask,p_template,p_hash,p_actor,free);
 update public.alimtalk_accounts set available_count=available_count-case when free then 0 else 1 end,updated_at=now() where company_id=p_company;
 return jsonb_build_object('accepted',true);
end;$$;
revoke all on function public.reserve_customer_completion(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_customer_completion(uuid,uuid,uuid,uuid,text,text,text) to service_role;
