-- Apply in Supabase SQL Editor before enabling relationship editing.
-- Existing wages, assignments and worker IDs are never changed.
begin;
create or replace function public.set_worker_relationship_type(
  p_actor uuid, p_worker uuid, p_type text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_company uuid;
  v_worker public.workers%rowtype;
  v_existing public.worker_relationships%rowtype;
begin
  if p_type not in ('employee','freelancer') then
    raise exception '직원 또는 프리랜서를 선택해주세요.';
  end if;
  select p.company_id into v_company
  from public.profiles p join public.companies c on c.id=p.company_id
  where p.id=p_actor and p.role='owner'
    and p.is_active is distinct from false and c.is_active=true;
  if v_company is null then raise exception '업체 관리자만 관계를 설정할 수 있습니다.'; end if;
  select * into v_worker from public.workers
  where id=p_worker and company_id=v_company and is_active=true for update;
  if not found then raise exception '해당 업체의 활성 시공자를 찾을 수 없습니다.'; end if;
  if v_worker.user_id is null then raise exception '계정 연결 후 관계를 설정해주세요.'; end if;
  if not exists(select 1 from auth.users where id=v_worker.user_id) then
    raise exception '시공자 계정이 존재하지 않습니다.';
  end if;
  select * into v_existing from public.worker_relationships where worker_id=p_worker for update;
  if found and v_existing.company_id is distinct from v_company then
    raise exception '다른 업체에 속한 관계 기록입니다.';
  end if;
  if found and v_existing.user_id is distinct from v_worker.user_id then
    raise exception '시공자 계정과 관계 기록이 다릅니다. 관리자에게 문의해주세요.';
  end if;
  if found and v_existing.ended_at is not null then
    raise exception '종료된 관계는 초대 절차로 다시 연결해주세요.';
  end if;
  insert into public.worker_relationships
    (worker_id,company_id,user_id,relationship_type,accepted_at,ended_at)
  values (p_worker,v_company,v_worker.user_id,p_type,now(),null)
  on conflict(worker_id) do update
  set relationship_type=excluded.relationship_type;
  return jsonb_build_object('ok',true,'workerId',p_worker,'relationshipType',p_type);
end $$;
revoke all on function public.set_worker_relationship_type(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_worker_relationship_type(uuid,uuid,text) to service_role;
commit;
