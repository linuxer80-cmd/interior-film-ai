-- Run after migration; all setting/history changes are rolled back.
begin;
do $$
declare target record;
begin
  select p.id as user_id,p.company_id into strict target from public.profiles p
  join public.companies c on c.id=p.company_id join public.company_leader_allowances a on a.company_id=c.id
  where p.role='owner' and p.is_active=true and c.is_active=true limit 1;
  perform set_config('test.company_id',target.company_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',target.user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',target.user_id::text,true);
  perform set_config('test.worker_wages',(select md5(string_agg(id::text||':'||coalesce(daily_wage::text,''),',' order by id)) from public.workers),true);
end $$;
set local role service_role;
do $$
declare cid uuid:=current_setting('test.company_id')::uuid; previous_version integer; affected integer;
begin
  select version into strict previous_version from public.company_leader_allowances where company_id=cid;
  update public.company_leader_allowances set amount=30000,effective_from='2026-09-01' where company_id=cid and version=previous_version;
  if (select version from public.company_leader_allowances where company_id=cid)<>previous_version+1 then raise exception 'version not advanced'; end if;
  if (select amount from public.company_leader_allowance_rates where company_id=cid and effective_from='2026-09-01')<>30000 then raise exception 'history missing'; end if;
  update public.company_leader_allowances set amount=50000,effective_from='2026-09-15' where company_id=cid and version=previous_version;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'stale version overwrote setting'; end if;
  update public.company_leader_allowances set amount=50000,effective_from='2026-09-15' where company_id=cid and version=previous_version+1;
  if (select amount from public.company_leader_allowance_rates where company_id=cid and effective_from='2026-09-01')<>30000 then raise exception 'previous amount changed'; end if;
  if (select amount from public.company_leader_allowance_rates where company_id=cid and effective_from='2026-09-15')<>50000 then raise exception 'new amount missing'; end if;
  begin
    update public.company_leader_allowances set amount=-1 where company_id=cid;
    raise exception 'negative amount accepted';
  exception when check_violation then null;
  end;
  begin
    update public.company_leader_allowances set effective_from='2026-09-10' where company_id=cid;
    raise exception 'backdated amount accepted';
  exception when raise_exception then
    if sqlerrm<>'적용일은 이전 팀장비용 적용일 이후로 지정해주세요.' then raise; end if;
  end;
end $$;
reset role;
set local role authenticated;
do $$
declare cid uuid:=current_setting('test.company_id')::uuid;
begin
  if (select count(*) from public.company_leader_allowances where company_id=cid)<>1 then raise exception 'owner cannot read'; end if;
  if exists(select 1 from public.company_leader_allowances where company_id<>cid) or exists(select 1 from public.company_leader_allowance_rates where company_id<>cid) then raise exception 'foreign company visible'; end if;
  begin
    update public.company_leader_allowances set amount=999999 where company_id=cid;
    raise exception 'direct update bypassed owner API';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select md5(string_agg(id::text||':'||coalesce(daily_wage::text,''),',' order by id)) from public.workers)<>current_setting('test.worker_wages') then raise exception 'personal wages changed'; end if;
  perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
end $$;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.company_leader_allowances) or exists(select 1 from public.company_leader_allowance_rates) then raise exception 'unlinked account can read settings'; end if;
end $$;
reset role;
rollback;
select 'PASS: company allowance snapshots, optimistic updates, unchanged personal wages and tenant isolation; all writes rolled back' as result;
