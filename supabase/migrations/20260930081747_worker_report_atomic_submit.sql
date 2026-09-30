-- One transaction prevents a failed cost save from freezing an incomplete report.
-- Only the server may call this; API-authenticated identities are checked again.
create or replace function public.submit_worker_work_report(
  p_company_id uuid, p_site_id uuid, p_worker_id uuid, p_user_id uuid,
  p_work_region text, p_work_summary text, p_memo text,
  p_materials jsonb, p_expenses jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_report public.work_reports%rowtype;
  v_report_id uuid;
  v_material_count integer;
  v_expense_count integer;
begin
  if not exists (
    select 1 from public.workers w join public.companies c on c.id = w.company_id
    where w.id = p_worker_id and w.user_id = p_user_id
      and w.company_id = p_company_id and w.is_active = true and c.is_active = true
  ) then
    raise exception '활성 시공자와 회사 정보를 확인해주세요.' using errcode = '42501';
  end if;

  -- Serialize competing submissions, including the first report for a site.
  select * into v_site from public.sites
    where id = p_site_id and company_id = p_company_id for update;
  if not found then
    raise exception '본인 회사의 현장만 이용할 수 있습니다.' using errcode = '42501';
  end if;
  if v_site.status = 'cancelled' then
    raise exception '취소된 현장에는 완료보고를 제출할 수 없습니다.';
  end if;
  if not exists (
    select 1 from public.site_workers sw
    where sw.company_id = p_company_id and sw.site_id = p_site_id and sw.worker_id = p_worker_id
      and (sw.role = 'leader' or exists (
        select 1 from public.site_daily_assignments a
        where a.company_id = p_company_id and a.site_id = p_site_id
          and a.worker_id = p_worker_id and a.role = 'leader'
      ))
  ) then
    raise exception '배정된 책임 팀장만 완료보고를 제출할 수 있습니다.' using errcode = '42501';
  end if;

  select * into v_report from public.work_reports
    where company_id = p_company_id and site_id = p_site_id for update;
  if found and v_report.review_status <> 'rejected' then
    raise exception '이미 제출되거나 승인된 완료보고입니다. 관리자 검수 상태를 확인해주세요.';
  end if;
  if nullif(btrim(p_work_summary), '') is null then
    raise exception '실제 시공 내용을 입력해주세요.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_materials) is distinct from 'array'
     or jsonb_typeof(p_expenses) is distinct from 'array' then
    raise exception '자재와 경비 입력 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_materials) > 100 or jsonb_array_length(p_expenses) > 100 then
    raise exception '자재와 경비는 각각 100개까지 등록할 수 있습니다.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.site_photos
    where company_id = p_company_id and site_id = p_site_id and photo_type = 'after') then
    raise exception '시공 완료 사진을 먼저 등록해주세요.' using errcode = '22023';
  end if;

  delete from public.site_materials
    where company_id = p_company_id and site_id = p_site_id and material_type = 'actual';
  insert into public.site_materials (
    company_id, site_id, film_product_id, brand, product_code, product_name,
    quantity, unit, unit_price, total_price, memo, created_by, material_type
  ) select p_company_id, p_site_id, x.film_product_id,
    nullif(btrim(x.brand), ''), nullif(btrim(x.product_code), ''), nullif(btrim(x.product_name), ''),
    coalesce(x.quantity, 0), coalesce(nullif(btrim(x.unit), ''), 'm'), x.unit_price,
    coalesce(x.quantity, 0) * x.unit_price, nullif(btrim(x.memo), ''), p_user_id, 'actual'
  from jsonb_to_recordset(p_materials) as x (
    film_product_id uuid, brand text, product_code text, product_name text,
    quantity numeric, unit text, unit_price numeric, memo text
  );
  get diagnostics v_material_count = row_count;
  if exists (select 1 from public.site_materials
    where company_id = p_company_id and site_id = p_site_id and material_type = 'actual' and unit_price < 0) then
    raise exception '자재 단가는 0원 이상이어야 합니다.' using errcode = '22023';
  end if;

  -- Keep costs entered separately by the administrator's profit screen.
  delete from public.site_expenses where company_id = p_company_id and site_id = p_site_id
    and (description is null or description not like '수익관리/%');
  -- site_expenses has created_by (auth user), not worker_id.
  insert into public.site_expenses (
    company_id, site_id, expense_type, amount, description, expense_date, created_by
  ) select p_company_id, p_site_id, coalesce(nullif(x.expense_type, ''), 'other'), x.amount,
    nullif(btrim(x.description), ''), coalesce(x.expense_date, (now() at time zone 'Asia/Seoul')::date), p_user_id
  from jsonb_to_recordset(p_expenses) as x (
    expense_type text, amount numeric, description text, expense_date date
  );
  get diagnostics v_expense_count = row_count;

  if v_report.id is null then
    insert into public.work_reports (
      company_id, site_id, worker_id, work_region, work_summary, memo,
      completed_at, created_by, review_status
    ) values (
      p_company_id, p_site_id, p_worker_id, nullif(btrim(p_work_region), ''), btrim(p_work_summary),
      nullif(btrim(p_memo), ''), now(), p_user_id, 'pending'
    ) returning id into v_report_id;
  else
    update public.work_reports set
      worker_id = p_worker_id, work_region = nullif(btrim(p_work_region), ''),
      work_summary = btrim(p_work_summary), memo = nullif(btrim(p_memo), ''),
      completed_at = now(), created_by = p_user_id, updated_at = now(), review_status = 'pending',
      reviewed_at = null, reviewed_by = null, approved_amount = null, review_memo = null
    where id = v_report.id and company_id = p_company_id
    returning id into v_report_id;
  end if;
  return jsonb_build_object('reportId', v_report_id, 'materialCount', v_material_count, 'expenseCount', v_expense_count);
end;
$$;

revoke all on function public.submit_worker_work_report(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.submit_worker_work_report(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
