begin;

-- 기존 attendance_action 함수의 나머지 동작은 유지합니다.
-- 동시 처리 잠금을 개인 user_id 기준으로 변경하고,
-- 다른 업체의 미퇴근 기록이 있을 때 새 출근을 차단합니다.

do $$
declare
  definition text;

  old_lock text :=
    'perform pg_advisory_xact_lock(hashtextextended(w::text,0));';

  new_lock text :=
    'perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));';

  old_query text :=
    'select * into rec from public.attendance_records where worker_id=w and ((work_day=day_k and site_id=s.id) or clock_out is null) order by clock_in desc limit 1;';

  new_query text :=
    'if exists(select 1 from public.attendance_records ar join public.workers aw on aw.id=ar.worker_id where aw.user_id=p_user and ar.clock_out is null and not(ar.site_id=s.id and ar.work_day=day_k)) then raise exception ''다른 현장의 퇴근을 먼저 기록해주세요.''; end if; select * into rec from public.attendance_records where worker_id=w and ((work_day=day_k and site_id=s.id) or clock_out is null) order by clock_in desc limit 1;';

begin
  definition := pg_get_functiondef(
    'public.attendance_action(uuid,text,jsonb)'::regprocedure
  );

  -- 같은 SQL을 다시 실행해도 중복 수정하지 않습니다.
  if position(new_lock in definition) > 0
     and position(new_query in definition) > 0
  then
    return;
  end if;

  -- 사용자가 제공한 함수 원문과 일치할 때만 변경합니다.
  if position(old_lock in definition) = 0
     or position(old_query in definition) = 0
  then
    raise exception
      '출퇴근 함수가 제공된 원문과 다릅니다. 최신 함수 원문을 확인해주세요.';
  end if;

  definition := replace(
    definition,
    old_lock,
    new_lock
  );

  definition := replace(
    definition,
    old_query,
    new_query
  );

  execute definition;
end;
$$;

-- 서버가 인증한 사용자로만 실행할 수 있도록 제한합니다.
revoke all
  on function public.attendance_action(uuid,text,jsonb)
  from public, anon, authenticated;

grant execute
  on function public.attendance_action(uuid,text,jsonb)
  to service_role;

commit;
