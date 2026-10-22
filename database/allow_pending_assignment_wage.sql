begin;
do $patch$
declare definition text; previous text;
begin
 definition:=pg_get_functiondef('app_private.capture_worker_assignment_wage()'::regprocedure);
 if position('allow_pending_assignment_wage_v1' in definition)=0 then
  previous:=definition;
  definition:=regexp_replace(definition,
   'if amount is null or amount<=0 or amount>100000000 then raise exception ''시공자가 등록 일당을 먼저 입력해야 합니다[.]''; end if;',
   'if amount is null or amount<=0 or amount>100000000 then return new; end if;');
  if definition=previous then raise exception '배정 일당 함수 형식이 다릅니다. 현재 함수 내용을 확인해주세요.'; end if;
  definition:=replace(definition,
   'if uid is null then raise exception ''연결된 활성 시공자를 확인해주세요.''; end if;',
   'if uid is null then return new; end if;');
  definition:=replace(definition,'declare uid uuid; amount numeric;',
   E'-- allow_pending_assignment_wage_v1: no rate snapshot until a valid rate exists.\ndeclare uid uuid; amount numeric;');
  execute definition;
 end if;
end $patch$;
commit;
select '프로필·일당 미등록 시공자 배정 저장 허용 완료' as result;
