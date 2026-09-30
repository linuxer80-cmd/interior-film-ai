-- Integration check for an initialized project. Uses an existing active owner
-- to exercise real RLS, but creates only a temporary worker; ALL writes roll back.
begin;
do $$
declare membership record;
begin
  select p.id as user_id,p.company_id into strict membership
  from public.profiles p join public.companies c on c.id=p.company_id
  where p.role='owner' and p.is_active=true and c.is_active=true limit 1;
  perform set_config('request.jwt.claims',json_build_object('sub',membership.user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',membership.user_id::text,true);
  perform set_config('test.company_id',membership.company_id::text,true);
end $$;
set local role authenticated;
do $$
declare wid uuid; cid uuid:=current_setting('test.company_id')::uuid;
begin
  insert into public.workers(company_id,name,phone,daily_wage,leader_allowance,pay_rate_effective_from)
  values(cid,'rollback pay test','test',250000,0,'2026-08-01') returning id into wid;
  if (select count(*) from public.worker_pay_rates where worker_id=wid)<>1 then raise exception 'new worker snapshot missing'; end if;
  update public.workers set leader_allowance=30000,pay_rate_effective_from='2026-09-01' where id=wid;
  update public.workers set daily_wage=260000,leader_allowance=40000,pay_rate_effective_from='2026-09-15' where id=wid;
  if (select count(*) from public.worker_pay_rates where worker_id=wid)<>3 then raise exception 'history count failed'; end if;
  if (select daily_wage from public.worker_pay_rates where worker_id=wid and effective_from='2026-08-01')<>250000 then raise exception 'baseline modified'; end if;
  update public.workers set leader_allowance=45000,pay_rate_effective_from='2026-09-15' where id=wid;
  if (select count(*) from public.worker_pay_rates where worker_id=wid)<>3 then raise exception 'same date duplicated'; end if;
  if (select leader_allowance from public.worker_pay_rates where worker_id=wid and effective_from='2026-09-01')<>30000 then raise exception 'earlier rate modified'; end if;
  begin
    update public.workers set leader_allowance=-1 where id=wid;
    raise exception 'negative allowance accepted';
  exception when check_violation then null;
  end;
  begin
    update public.workers set pay_rate_effective_from='2026-09-10' where id=wid;
    raise exception 'old date accepted';
  exception when raise_exception then
    if sqlerrm <> '적용 시작일은 이전 단가 적용일 이후로 지정해주세요.' then raise; end if;
  end;
  if exists(select 1 from public.worker_pay_rates where company_id<>cid) then raise exception 'foreign company rates visible'; end if;
  begin
    insert into public.worker_pay_rates(company_id,worker_id,effective_from,daily_wage,leader_allowance)
    values(gen_random_uuid(),wid,'2026-09-20',1,1);
    raise exception 'foreign company write accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
end $$;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.worker_pay_rates) then raise exception 'unlinked account can see rates'; end if;
end $$;
reset role;
rollback;
select 'PASS: history, amount/date constraints, atomic inserts and tenant isolation; test writes rolled back' as result;
