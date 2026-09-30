-- Run with an administrative DB connection. Every fixture is rolled back.
begin;
do $$
declare
  w public.workers%rowtype;
  s uuid := gen_random_uuid();
  r uuid;
  result jsonb;
  failed boolean;
  signature text := 'public.submit_worker_work_report(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb)';
begin
  assert not has_function_privilege('anon', signature, 'execute');
  assert not has_function_privilege('authenticated', signature, 'execute');
  assert has_function_privilege('service_role', signature, 'execute');
  select workers.* into strict w from public.workers
    join public.companies c on c.id = workers.company_id
    where workers.is_active and workers.user_id is not null and c.is_active limit 1;
  insert into public.sites(id,company_id,site_name,status) values(s,w.company_id,'report-transaction-test','in_progress');
  insert into public.site_workers(company_id,site_id,worker_id,role) values(w.company_id,s,w.id,'leader');
  insert into public.site_materials(company_id,site_id,material_type,product_code,quantity)
    values(w.company_id,s,'planned','keep-planned',2),(w.company_id,s,'actual','old-actual',3);
  insert into public.site_expenses(company_id,site_id,amount,description)
    values(w.company_id,s,1000,'old-expense'),(w.company_id,s,2000,'수익관리/other: keep-admin');

  failed := false;
  begin
    perform public.submit_worker_work_report(w.company_id,s,w.id,w.user_id,null,'done',null,'[]','[]');
  exception when invalid_parameter_value then failed := true; end;
  assert failed, 'Missing after-photo must prevent submission';
  assert not exists(select 1 from public.work_reports where site_id=s);
  insert into public.site_photos(company_id,site_id,photo_type,storage_path)
    values(w.company_id,s,'after','rollback-only/report-test.jpg');

  failed := false;
  begin
    perform public.submit_worker_work_report(w.company_id,s,w.id,w.user_id,null,'done',null,
      '[{"product_code":"new","quantity":2}]','[{"expense_type":"meal","amount":-1}]');
  exception when check_violation then failed := true; end;
  assert failed, 'Expense failure must abort the whole transaction';
  assert not exists(select 1 from public.work_reports where site_id=s);
  assert exists(select 1 from public.site_materials where site_id=s and product_code='old-actual');
  assert exists(select 1 from public.site_expenses where site_id=s and description='old-expense');

  result := public.submit_worker_work_report(w.company_id,s,w.id,w.user_id,null,'done',null,
    '[{"product_code":"new","quantity":2,"unit_price":5000}]',
    '[{"expense_type":"meal","amount":15000}]');
  r := (result->>'reportId')::uuid;
  assert result->>'materialCount' = '1' and result->>'expenseCount' = '1';
  assert exists(select 1 from public.work_reports where id=r and review_status='pending');
  assert exists(select 1 from public.site_expenses where site_id=s and amount=15000 and created_by=w.user_id);
  assert exists(select 1 from public.site_expenses where site_id=s and description='수익관리/other: keep-admin');
  assert exists(select 1 from public.site_materials where site_id=s and product_code='keep-planned');
  assert exists(select 1 from public.site_materials where site_id=s and product_code='new' and total_price=10000);

  failed := false;
  begin
    perform public.submit_worker_work_report(w.company_id,s,w.id,w.user_id,null,'duplicate',null,'[]','[]');
  exception when raise_exception then failed := true; end;
  assert failed, 'Duplicate submission must be blocked';
  assert (select count(*) from public.work_reports where site_id=s) = 1;
  update public.work_reports set review_status='rejected',review_memo='keep correction' where id=r;
  failed := false;
  begin
    perform public.submit_worker_work_report(w.company_id,s,w.id,w.user_id,null,'bad correction',null,
      '[]','[{"amount":null}]');
  exception when not_null_violation then failed := true; end;
  assert failed;
  assert exists(select 1 from public.work_reports where id=r and review_status='rejected' and work_summary='done');
  assert exists(select 1 from public.site_expenses where site_id=s and amount=15000);
  result := public.submit_worker_work_report(w.company_id,s,w.id,w.user_id,null,'corrected',null,'[]','[]');
  assert (result->>'reportId')::uuid = r;
  assert exists(select 1 from public.work_reports where id=r and review_status='pending' and work_summary='corrected');

  update public.work_reports set review_status='approved' where id=r;
  failed := false;
  begin
    perform public.submit_worker_work_report(w.company_id,s,w.id,w.user_id,null,'overwrite',null,'[]','[]');
  exception when raise_exception then failed := true; end;
  assert failed, 'Approved reports stay frozen';
  failed := false;
  begin
    perform public.submit_worker_work_report(gen_random_uuid(),s,w.id,w.user_id,null,'other company',null,'[]','[]');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'Company mismatch must be denied';
  update public.site_workers set role='member' where site_id=s;
  failed := false;
  begin
    perform public.submit_worker_work_report(w.company_id,s,w.id,w.user_id,null,'member',null,'[]','[]');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'Unassigned leader/member cannot submit';
end;
$$;
rollback;
select 'report transaction checks passed; fixtures rolled back' as result;
