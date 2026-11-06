-- Resubmit only the report text. Existing material and expense rows (including
-- their IDs, authors and reimbursement recipients) remain unchanged.
create or replace function public.assistant_resubmit_report(
  p_company_id uuid, p_site_id uuid, p_worker_id uuid, p_user_id uuid,
  p_report_id uuid, p_expected_updated_at timestamptz,
  p_work_region text, p_work_summary text, p_memo text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_site public.sites%rowtype;
  v_report public.work_reports%rowtype;
  v_expected jsonb;
  v_actual jsonb;
begin
  if not exists (
    select 1 from public.workers w join public.companies c on c.id=w.company_id
    where w.id=p_worker_id and w.user_id=p_user_id and w.company_id=p_company_id
      and w.is_active=true and c.is_active=true
  ) or exists(select 1 from public.profiles p where p.id=p_user_id and p.is_active=false) then
    raise exception '활성 시공자와 업체 정보를 확인해주세요.' using errcode='42501';
  end if;
  select * into v_site from public.sites where id=p_site_id and company_id=p_company_id for update;
  if not found then raise exception '현장을 확인할 수 없습니다.' using errcode='42501'; end if;
  if v_site.status='cancelled' then raise exception '취소된 현장에는 재제출할 수 없습니다.' using errcode='P0001'; end if;
  if not exists (
    select 1 from public.site_operation_workers(p_site_id) w
    where w.worker_id=p_worker_id and w.user_id=p_user_id
      and (w.role='leader' or not exists(select 1 from public.site_operation_workers(p_site_id) x where x.role='leader'))
  ) then raise exception '책임 팀장 또는 지정 담당자만 재제출할 수 있습니다.' using errcode='42501'; end if;
  if p_report_id is null or p_expected_updated_at is null then
    raise exception '기존 보고서와 수정 시각을 확인해주세요.' using errcode='22023';
  end if;
  select * into v_report from public.work_reports where id=p_report_id and site_id=p_site_id and company_id=p_company_id for update;
  if not found or v_report.review_status is distinct from 'rejected' or v_report.updated_at is distinct from p_expected_updated_at then
    raise exception '보고서가 변경되었습니다. 최신 내용을 다시 확인해주세요.' using errcode='P0001';
  end if;
  if exists(select 1 from public.work_reports r where r.company_id=p_company_id and r.site_id=p_site_id and r.id<>v_report.id
      and (r.review_status is distinct from 'rejected' or r.updated_at>=v_report.updated_at)) then
    raise exception '다른 최신 보고서가 있습니다. 보고서 상태를 다시 확인해주세요.' using errcode='P0001';
  end if;
  if nullif(btrim(p_work_summary),'') is null or length(p_work_summary)>5000 or coalesce(length(p_work_region),0)>5000 or coalesce(length(p_memo),0)>5000 then
    raise exception '시공 내용과 입력 길이를 확인해주세요.' using errcode='22023';
  end if;
  if not exists(select 1 from public.site_photos where company_id=p_company_id and site_id=p_site_id and photo_type='after') then
    raise exception '시공 완료 사진을 먼저 등록해주세요.' using errcode='22023';
  end if;
  -- Planned materials are settled by the original submission function. If the
  -- current issued/returned quantities no longer agree, do not silently retain
  -- stale costs or replace manual rows: ask for the full correction workflow.
  if exists(select 1 from public.site_materials where company_id=p_company_id and site_id=p_site_id and material_type='planned' and removed_at is null) then
    select coalesce(jsonb_agg(q.obj order by q.obj::text),'[]'::jsonb) into v_expected
    from (
      select jsonb_build_object(
        'film_product_id',e->>'film_product_id','brand',nullif(btrim(e->>'brand'),''),
        'product_code',nullif(btrim(e->>'product_code'),''),'product_name',nullif(btrim(e->>'product_name'),''),
        'quantity',coalesce((e->>'quantity')::numeric,0),'unit',coalesce(nullif(btrim(e->>'unit'),''),'m'),
        'unit_price',(e->>'unit_price')::numeric,'memo',nullif(btrim(e->>'memo'),''),'price_type',e->>'price_type'
      ) as obj from jsonb_array_elements(public.report_material_settlement(p_company_id,p_site_id)) e
    ) q;
    select coalesce(jsonb_agg(q.obj order by q.obj::text),'[]'::jsonb) into v_actual
    from (
      select jsonb_build_object(
        'film_product_id',m.film_product_id::text,'brand',m.brand,'product_code',m.product_code,'product_name',m.product_name,
        'quantity',m.quantity,'unit',m.unit,'unit_price',m.unit_price,'memo',m.memo,'price_type',m.price_type
      ) as obj from public.site_materials m
      where m.company_id=p_company_id and m.site_id=p_site_id and m.material_type='actual'
    ) q;
    if v_actual is distinct from v_expected then
      raise exception '필름 반출·반입 또는 기존 자재 내역이 달라졌습니다. 기존 보고서 화면에서 자재를 확인한 뒤 재제출해주세요.' using errcode='P0001';
    end if;
  end if;
  update public.work_reports set
    worker_id=p_worker_id,work_region=nullif(btrim(p_work_region),''),work_summary=btrim(p_work_summary),memo=nullif(btrim(p_memo),''),
    completed_at=now(),created_by=p_user_id,updated_at=now(),review_status='pending',
    reviewed_at=null,reviewed_by=null,approved_amount=null,review_memo=null
  where id=v_report.id and company_id=p_company_id;
  return jsonb_build_object('reportId',v_report.id,'review_status','pending');
end;
$$;
revoke all on function public.assistant_resubmit_report(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.assistant_resubmit_report(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,text) to service_role;
notify pgrst,'reload schema';
