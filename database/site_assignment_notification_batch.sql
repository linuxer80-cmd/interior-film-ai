-- Apply before deploying the matching API change. The original replacement
-- function and other triggers remain intact; this wrapper suppresses only the
-- per-row assignment/legacy-assignment notices for this one site/transaction.
create or replace function public.replace_site_daily_assignments_notified(
  p_company_id uuid, p_site_id uuid, p_rows jsonb, p_actor_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  before_rows jsonb;
  after_rows jsonb;
  previous_batch text;
  v_event uuid;
  v_name text;
  v_message text;
begin
  if not exists (select 1 from public.profiles p join public.companies c on c.id=p.company_id
    where p.id=p_actor_id and p.company_id=p_company_id and p.role='owner'
      and p.is_active=true and c.is_active=true) then
    raise exception '활성 업체 관리자만 배정할 수 있습니다.' using errcode='42501';
  end if;
  select coalesce(nullif(btrim(site_name),''),'현장') into v_name
    from public.sites where id=p_site_id and company_id=p_company_id for update;
  if not found then raise exception '현장을 찾을 수 없습니다.'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(work_date,worker_id,role)
    order by work_date,worker_id),'[]'::jsonb) into before_rows
    from public.site_daily_assignments where company_id=p_company_id and site_id=p_site_id;
  previous_batch:=current_setting('app.assignment_batch_site',true);
  perform set_config('app.assignment_batch_site',p_site_id::text,true);
  perform public.replace_site_daily_assignments(p_company_id,p_site_id,p_rows);
  perform set_config('app.assignment_batch_site',coalesce(previous_batch,''),true);
  select coalesce(jsonb_agg(jsonb_build_array(work_date,worker_id,role)
    order by work_date,worker_id),'[]'::jsonb) into after_rows
    from public.site_daily_assignments where company_id=p_company_id and site_id=p_site_id;
  -- Initial assignments are covered by the explicit personal assignment notice.
  if before_rows='[]'::jsonb or before_rows=after_rows then return; end if;
  v_message:=app_private.assignment_change_message(p_company_id,before_rows,after_rows);
  insert into public.site_change_events(site_id,company_id,message)
    values(p_site_id,p_company_id,v_message) returning id into v_event;
  insert into public.site_change_receipts(event_id,worker_id)
    select v_event,w.worker_id from public.site_operation_workers(p_site_id) w;
  -- People with their own changed dates receive the personal notice from the
  -- API. Inform other existing team members once about the team change.
  insert into public.notifications(company_id,recipient_type,recipient_user_id,recipient_worker_id,
    type,priority,title,message,link,reference_type,reference_id,dedupe_key)
  select p_company_id,'worker',w.user_id,w.worker_id,'site_change','info',
    left(v_name,60)||' · 현장 변경',left(v_message,240),'/worker/site/'||p_site_id::text,
    'site',p_site_id::text,'site_change:'||v_event::text||':'||w.worker_id::text
  from public.site_operation_workers(p_site_id) w
  where w.user_id is not null and w.user_id<>p_actor_id
    and exists (select 1 from jsonb_array_elements(before_rows) a where a->>1=w.worker_id::text)
    and not exists (
      select 1 from (
        select value from jsonb_array_elements(before_rows) where value->>1=w.worker_id::text
        except select value from jsonb_array_elements(after_rows) where value->>1=w.worker_id::text
        union all
        (select value from jsonb_array_elements(after_rows) where value->>1=w.worker_id::text
         except select value from jsonb_array_elements(before_rows) where value->>1=w.worker_id::text)
      ) changed
    );
end $$;
revoke all on function public.replace_site_daily_assignments_notified(uuid,uuid,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.replace_site_daily_assignments_notified(uuid,uuid,jsonb,uuid) to service_role;
