-- Worker-entered completion-report expenses belong to the submitting worker.
-- Labor rows share the expense table but are already calculated as labor; never
-- reimburse those a second time. Existing records and payment records are untouched.
do $migration$
declare
  signature regprocedure := 'public.submit_worker_work_report(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure;
  original text;
  updated text;
  old_columns text := 'company_id, site_id, expense_type, amount, description, expense_date, created_by';
  new_columns text := 'company_id, site_id, expense_type, amount, description, expense_date, created_by, reimbursement_worker_id';
  old_value text := E'p_user_id\n  from jsonb_to_recordset(p_expenses)';
  new_value text := E'p_user_id, case when x.description like ''완료보고/인건비:%'' then null else p_worker_id end\n  from jsonb_to_recordset(p_expenses)';
begin
  select pg_get_functiondef(signature) into original;
  if position(new_columns in original) > 0 and position(new_value in original) > 0 then
    return;
  end if;
  if position(old_columns in original) = 0 or position(old_value in original) = 0
     or length(original) - length(replace(original, old_columns, '')) <> length(old_columns)
     or length(original) - length(replace(original, old_value, '')) <> length(old_value) then
    raise exception '완료보고 함수가 예상과 다릅니다. 안전을 위해 변경을 중단합니다.';
  end if;
  updated := replace(replace(original, old_columns, new_columns), old_value, new_value);
  execute updated;
end
$migration$;
