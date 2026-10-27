-- Pre-fix deployed RPC definitions for the archived-material regression test.
CREATE OR REPLACE FUNCTION public.site_operations(p_user uuid, p_site uuid, p_action text DEFAULT 'get'::text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 s public.sites%rowtype; material_row public.site_materials%rowtype;
 owner_access boolean; worker uuid; can_return boolean; locked boolean;
 qty numeric; issued numeric; mat uuid; event uuid; result jsonb; r record; snapshot jsonb; snapshot_version text;
begin
 select * into s from public.sites where id=p_site for update;
 if not found or not exists(select 1 from public.companies where id=s.company_id and is_active=true) then
  raise exception '현장을 확인할 수 없습니다.' using errcode='42501';
 end if;
 select exists(select 1 from public.profiles where id=p_user and company_id=s.company_id and role='owner' and is_active is distinct from false) into owner_access;
 select w.worker_id into worker from public.site_operation_workers(p_site) w where w.user_id=p_user limit 1;
 if not owner_access and worker is null then raise exception '배정된 현장만 이용할 수 있습니다.' using errcode='42501'; end if;
 select owner_access or exists(select 1 from public.site_operation_workers(p_site) w where w.user_id=p_user and w.role='leader')
   or (worker is not null and not exists(select 1 from public.site_operation_workers(p_site) w where w.role='leader')) into can_return;
 select s.status='cancelled' or exists(select 1 from public.work_reports where site_id=p_site and review_status in ('pending','approved')) into locked;
 if p_action in ('latest','confirm') then
  snapshot:=jsonb_build_object(
   'site',jsonb_build_object('id',s.id,'site_name',s.site_name,'memo',s.memo,
     'schedule_start',s.schedule_start,'schedule_end',s.schedule_end,'schedule_date',s.schedule_date,
     'work_dates',s.work_dates,'work_description',s.work_description,'work_type',s.work_type),
   'assignments',coalesce((select jsonb_agg(jsonb_build_object('name',w.name,'date',d.work_date,'role',d.role) order by d.work_date,w.id)
     from public.site_daily_assignments d join public.workers w on w.id=d.worker_id and w.company_id=s.company_id
     where d.site_id=p_site and d.company_id=s.company_id),'[]'::jsonb),
   'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'brand',m.brand,'code',m.product_code,
     'name',m.product_name,'quantity',m.quantity,'unit',m.unit,'memo',m.memo) order by m.id)
     from public.site_materials m where m.site_id=p_site and m.company_id=s.company_id and m.material_type='planned'),'[]'::jsonb),
   'changeCount',(select count(*) from public.site_change_events where site_id=p_site));
  snapshot_version:=md5(snapshot::text);
  if p_action='latest' then
   return jsonb_build_object('snapshot',snapshot,'version',snapshot_version);
  end if;
 end if;
 if p_action='confirm' then
  if p_body->>'reviewVersion' is distinct from snapshot_version then
   raise exception '내용이 다시 변경되었습니다. 최신 내용 보기를 눌러 확인해주세요.';
  end if;
  event:=(p_body->>'eventId')::uuid;
  update public.site_change_receipts a set confirmed_at=coalesce(a.confirmed_at,now()), reviewed_version=snapshot_version
   from public.site_change_events e where a.event_id=e.id and e.id=event and e.site_id=p_site and a.worker_id=worker;
  if not found then raise exception '본인에게 전달된 변경사항만 확인할 수 있습니다.' using errcode='42501'; end if;
 elsif p_action='settle' then perform public.save_report_material_flow(p_user,p_site,p_body); elsif p_action in ('issue','void','return') then
  if locked then raise exception '취소 또는 보고서 제출·승인된 현장입니다. 수정하려면 보고서를 반려해주세요.'; end if;
  if p_action in ('issue','void') and not owner_access then raise exception '관리자만 반출을 등록할 수 있습니다.' using errcode='42501'; end if;
  if p_action='return' and not can_return then raise exception '팀장 또는 팀장이 없는 현장의 담당자만 반입량을 입력할 수 있습니다.' using errcode='42501'; end if;
  mat:=(p_body->>'materialId')::uuid;
  select * into material_row from public.site_materials where id=mat and site_id=p_site and company_id=s.company_id and material_type='planned' for update;
  if not found then raise exception '예정 자재를 먼저 등록해주세요.'; end if;
  if p_action='issue' then
   qty:=(p_body->>'quantity')::numeric;
   if qty is null or qty<=0 or qty>1000000 or qty::text in ('NaN','Infinity','-Infinity') then raise exception '반출 수량을 확인해주세요.' using errcode='22023'; end if;
   insert into public.site_material_issues(id,company_id,site_id,material_id,quantity,created_by)
    values((p_body->>'requestId')::uuid,s.company_id,p_site,mat,qty,p_user) on conflict(id) do nothing;
   if found then
    insert into public.site_material_return_history(site_id,company_id,material_id,before_quantity,after_quantity,reason,created_by)
     select p_site,s.company_id,mat,quantity,null,case when p_action='issue' then '추가 반출로 재확인 필요' else '반출 취소로 재확인 필요' end,p_user
     from public.site_material_returns where material_id=mat;
    delete from public.site_material_returns where material_id=mat;
    perform app_private.record_site_change(p_site,'자재 반출: '||coalesce(material_row.product_code,material_row.product_name,'')||' '||qty||material_row.unit||'. 반입량을 다시 확인해주세요.');
   end if;
  elsif p_action='void' then
   update public.site_material_issues set voided_at=now(),voided_by=p_user
    where id=(p_body->>'issueId')::uuid and site_id=p_site and material_id=mat and voided_at is null;
   if not found then raise exception '이미 취소되었거나 없는 반출 기록입니다.'; end if;
   insert into public.site_material_return_history(site_id,company_id,material_id,before_quantity,after_quantity,reason,created_by)
     select p_site,s.company_id,mat,quantity,null,case when p_action='issue' then '추가 반출로 재확인 필요' else '반출 취소로 재확인 필요' end,p_user
     from public.site_material_returns where material_id=mat;
    delete from public.site_material_returns where material_id=mat;
   perform app_private.record_site_change(p_site,'자재 반출 기록이 취소되었습니다. 반입량을 다시 확인해주세요.');
  else
   qty:=(p_body->>'quantity')::numeric;
   select coalesce(sum(quantity),0) into issued from public.site_material_issues where material_id=mat and voided_at is null;
   if issued=0 or qty is null or qty<0 or qty>issued or qty::text in ('NaN','Infinity','-Infinity') then raise exception '반입량은 0 이상 총 반출량 이하여야 합니다.' using errcode='22023'; end if;
   if coalesce((p_body->>'issued')::numeric,-1)<>issued then raise exception '반출량이 변경되었습니다. 새로고침 후 다시 입력해주세요.'; end if;
   if (select updated_at from public.site_material_returns where material_id=mat) is distinct from (p_body->>'returnUpdatedAt')::timestamptz then raise exception '다른 담당자가 반입량을 변경했습니다. 새로고침 후 확인해주세요.'; end if;
   insert into public.site_material_return_history(site_id,company_id,material_id,before_quantity,after_quantity,reason,created_by)
    select p_site,s.company_id,mat,(select quantity from public.site_material_returns where material_id=mat),qty,'반입량 저장',p_user
    where (select quantity from public.site_material_returns where material_id=mat) is distinct from qty;
   insert into public.site_material_returns(material_id,site_id,company_id,quantity,updated_by)
    values(mat,p_site,s.company_id,qty,p_user)
    on conflict(material_id) do update set quantity=excluded.quantity,updated_by=p_user,updated_at=now();
  end if;
 elsif p_action<>'get' then raise exception '지원하지 않는 요청입니다.' using errcode='22023';
 end if;
 select jsonb_build_object(
  'owner',owner_access,'canReturn',can_return,'locked',locked,
  'materials',coalesce((select jsonb_agg(jsonb_build_object(
   'id',m.id,'brand',m.brand,'code',m.product_code,'name',m.product_name,'unit',m.unit,
   'issued',coalesce(i.qty,0),'returned',rt.quantity,'returnUpdatedAt',rt.updated_at,
   'used',case when rt.quantity is not null then coalesce(i.qty,0)-rt.quantity end,
   'unitPrice',case when owner_access then m.unit_price end))
   from public.site_materials m left join (select material_id,sum(quantity) qty from public.site_material_issues where voided_at is null group by material_id) i on i.material_id=m.id
   left join public.site_material_returns rt on rt.material_id=m.id
   where m.site_id=p_site and m.material_type='planned'),'[]'::jsonb),
  'returnHistory',coalesce((select jsonb_agg(h.obj order by h.created_at desc) from (
    select rh.created_at,jsonb_build_object('id',rh.id,'materialId',rh.material_id,
      'before',rh.before_quantity,'after',rh.after_quantity,'reason',rh.reason,'at',rh.created_at,
      'name',coalesce((select p.name from public.profiles p where p.id=rh.created_by and p.company_id=s.company_id),
        (select w.name from public.workers w where w.user_id=rh.created_by and w.company_id=s.company_id limit 1),'담당자')) obj
    from public.site_material_return_history rh where rh.site_id=p_site order by rh.created_at desc limit 100
  ) h),'[]'::jsonb),
  'issues',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'materialId',i.material_id,'quantity',i.quantity,'at',i.created_at,'voided',i.voided_at) order by i.created_at desc)
    from public.site_material_issues i where i.site_id=p_site),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(x.obj order by x.created_at desc) from (
    select e.created_at,jsonb_build_object('id',e.id,'message',e.message,'at',e.created_at,
     'receipts',(select coalesce(jsonb_agg(jsonb_build_object('name',w.name,'confirmedAt',a.confirmed_at)),'[]'::jsonb)
       from public.site_change_receipts a join public.workers w on w.id=a.worker_id
       where a.event_id=e.id and (owner_access or a.worker_id=worker))) obj
    from public.site_change_events e where e.site_id=p_site and (owner_access or exists(select 1 from public.site_change_receipts a where a.event_id=e.id and a.worker_id=worker))
    order by e.created_at desc limit 100
  ) x),'[]'::jsonb)
 ) into result;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_report_material_flow(p_user uuid, p_site uuid, p_body jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  state jsonb;
  m public.site_materials%rowtype;
  v_out numeric;
  v_back numeric;
  v_before numeric;
  v_return numeric;
  v_updated timestamptz;
  v_request uuid;
  v_expected numeric;
begin
  state := public.site_operations(
    p_user,
    p_site,
    'get',
    '{}'::jsonb
  );

  if (state->>'locked')::boolean then
    raise exception
      '취소 또는 보고서 제출·승인된 현장입니다. 수정하려면 보고서를 반려해주세요.';
  end if;

  if not coalesce((state->>'canReturn')::boolean, false) then
    raise exception
      '팀장 또는 팀장이 없는 현장의 담당자만 수량을 입력할 수 있습니다.'
      using errcode = '42501';
  end if;

  select *
  into m
  from public.site_materials
  where id = (p_body->>'materialId')::uuid
    and site_id = p_site
    and material_type = 'planned'
  for update;

  if not found then
    raise exception
      '관리자가 사용 필름을 먼저 등록해주세요.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.sites s
    where s.id = p_site
      and s.company_id = m.company_id
  ) then
    raise exception
      '현장의 회사 정보를 확인해주세요.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and p.company_id = m.company_id
      and p.role = 'owner'
      and p.is_active is distinct from false
  )
  and not exists (
    select 1
    from public.workers w
    where w.user_id = p_user
      and w.company_id = m.company_id
      and w.is_active = true
  ) then
    raise exception
      '활성 담당자만 수량을 입력할 수 있습니다.'
      using errcode = '42501';
  end if;

  v_out := nullif(btrim(p_body->>'outgoing'), '')::numeric;
  v_back := nullif(btrim(p_body->>'returned'), '')::numeric;
  v_expected := nullif(btrim(p_body->>'expectedIssued'), '')::numeric;
  v_request := (p_body->>'requestId')::uuid;

  if v_request is null
     or v_expected is null
     or v_out is null
     or v_back is null
     or v_out::text in ('NaN', 'Infinity', '-Infinity')
     or v_back::text in ('NaN', 'Infinity', '-Infinity')
     or v_out < 0
     or v_out > 1000000
     or v_back < 0
     or v_back > v_out then
    raise exception
      '반출·반입량을 모두 입력해주세요. 반입량은 0 이상 반출량 이하여야 합니다.'
      using errcode = '22023';
  end if;

  select coalesce(sum(quantity), 0)
  into v_before
  from public.site_material_issues
  where site_id = p_site
    and company_id = m.company_id
    and material_id = m.id
    and voided_at is null;

  select quantity, updated_at
  into v_return, v_updated
  from public.site_material_returns
  where material_id = m.id
    and site_id = p_site
    and company_id = m.company_id
  for update;

  if v_before = v_out
     and v_return is not distinct from v_back then
    return;
  end if;

  if v_expected is distinct from v_before
     or v_updated is distinct from
       (p_body->>'returnUpdatedAt')::timestamptz then
    raise exception
      '다른 담당자가 수량을 변경했습니다. 저장값으로 되돌린 후 다시 입력해주세요.'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.site_material_issues
    where id = v_request
  ) then
    raise exception
      '이미 사용한 저장 요청입니다. 수량을 확인한 후 다시 입력해주세요.'
      using errcode = '22023';
  end if;

  if v_out <> v_before then
    update public.site_material_issues
    set voided_at = now(),
        voided_by = p_user
    where site_id = p_site
      and company_id = m.company_id
      and material_id = m.id
      and voided_at is null;

    if v_out > 0 then
      insert into public.site_material_issues (
        id,
        company_id,
        site_id,
        material_id,
        quantity,
        created_by
      )
      values (
        v_request,
        m.company_id,
        p_site,
        m.id,
        v_out,
        p_user
      );
    end if;
  end if;

  insert into public.site_material_return_history (
    site_id,
    company_id,
    material_id,
    before_quantity,
    after_quantity,
    reason,
    created_by
  )
  values (
    p_site,
    m.company_id,
    m.id,
    v_return,
    v_back,
    '보고서 반출·반입 저장 (총 반출 '
      || v_before || ' → ' || v_out || ' ' || m.unit || ')',
    p_user
  );

  insert into public.site_material_returns (
    material_id,
    site_id,
    company_id,
    quantity,
    updated_by
  )
  values (
    m.id,
    p_site,
    m.company_id,
    v_back,
    p_user
  )
  on conflict (material_id)
  do update set
    quantity = excluded.quantity,
    updated_by = p_user,
    updated_at = now();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_site_material_outgoing(p_user uuid, p_site uuid, p_body jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  state jsonb;
  m public.site_materials%rowtype;
  qty numeric;
  issued numeric;
  expected numeric;
  returned numeric;
  version timestamptz;
  request_id uuid;
begin
  -- 기존 현장 잠금·회사·배정·팀장 권한 검사를 재사용합니다.
  state := public.site_operations(
    p_user,
    p_site,
    'get',
    '{}'::jsonb
  );

  if coalesce((state->>'locked')::boolean, true) then
    raise exception
      '보고서 제출·승인 또는 취소된 현장입니다. 수정하려면 보고서를 반려해주세요.';
  end if;

  if not coalesce((state->>'canReturn')::boolean, false) then
    raise exception
      '책임 팀장 또는 팀장이 없는 현장의 담당자만 반출량을 저장할 수 있습니다.'
      using errcode='42501';
  end if;

  select * into m
  from public.site_materials
  where id=(p_body->>'materialId')::uuid
    and site_id=p_site
    and material_type='planned'
  for update;

  if not found then
    raise exception
      '관리자가 사용할 필름을 먼저 등록해주세요.'
      using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.sites s
    where s.id=p_site
      and s.company_id=m.company_id
  ) then
    raise exception
      '현장의 회사 정보를 확인해주세요.'
      using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id=p_user
      and p.company_id=m.company_id
      and p.role='owner'
      and p.is_active is distinct from false
  )
  and not exists (
    select 1
    from public.workers w
    where w.user_id=p_user
      and w.company_id=m.company_id
      and w.is_active=true
  ) then
    raise exception
      '활성 담당자만 반출량을 저장할 수 있습니다.'
      using errcode='42501';
  end if;

  qty := nullif(btrim(p_body->>'outgoing'), '')::numeric;
  expected := nullif(btrim(p_body->>'expectedIssued'), '')::numeric;
  request_id := (p_body->>'requestId')::uuid;

  if qty is null
     or expected is null
     or request_id is null
     or qty::text in ('NaN', 'Infinity', '-Infinity')
     or expected::text in ('NaN', 'Infinity', '-Infinity')
     or qty<0
     or qty>1000000
     or expected<0 then
    raise exception
      '총 반출량은 0 이상 1,000,000 이하로 입력해주세요.'
      using errcode='22023';
  end if;

  select coalesce(sum(quantity), 0)
  into issued
  from public.site_material_issues
  where site_id=p_site
    and company_id=m.company_id
    and material_id=m.id
    and voided_at is null;

  select quantity, updated_at
  into returned, version
  from public.site_material_returns
  where site_id=p_site
    and company_id=m.company_id
    and material_id=m.id
  for update;

  -- 같은 총량 재시도는 반출을 추가하거나 반입량을 지우지 않습니다.
  if issued=qty then
    return state;
  end if;

  if issued is distinct from expected
     or version is distinct from
       (p_body->>'returnUpdatedAt')::timestamptz then
    raise exception
      '다른 담당자가 수량을 변경했습니다. 저장값으로 되돌린 후 다시 입력해주세요.'
      using errcode='40001';
  end if;

  if exists (
    select 1
    from public.site_material_issues
    where id=request_id
  ) then
    raise exception
      '이미 사용한 저장 요청입니다. 저장값으로 되돌린 후 다시 입력해주세요.'
      using errcode='40001';
  end if;

  -- 기존 기록은 삭제하지 않고 취소 표시 후 새 총량을 저장합니다.
  update public.site_material_issues
  set voided_at=now(),
      voided_by=p_user
  where site_id=p_site
    and company_id=m.company_id
    and material_id=m.id
    and voided_at is null;

  if qty>0 then
    insert into public.site_material_issues (
      id,
      company_id,
      site_id,
      material_id,
      quantity,
      created_by
    )
    values (
      request_id,
      m.company_id,
      p_site,
      m.id,
      qty,
      p_user
    );
  end if;

  insert into public.site_material_return_history (
    site_id,
    company_id,
    material_id,
    before_quantity,
    after_quantity,
    reason,
    created_by
  )
  values (
    p_site,
    m.company_id,
    m.id,
    returned,
    null,
    '반출량만 저장: ' || issued || ' → ' || qty ||
      ' ' || m.unit || ' (반입량 확인 필요)',
    p_user
  );

  -- 반출량이 바뀌면 기존 반입량은 다시 확인하도록 합니다.
  delete from public.site_material_returns
  where site_id=p_site
    and company_id=m.company_id
    and material_id=m.id;

  return public.site_operations(
    p_user,
    p_site,
    'get',
    '{}'::jsonb
  );
end;
$function$;
