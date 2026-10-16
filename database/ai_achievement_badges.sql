begin;
-- AI 사용량·요금제 설정은 변경하지 않습니다.
create or replace function public.achievement_ai_metrics(p_company uuid)
returns jsonb language sql security invoker set search_path='' as $ai$
 with feature_map(feature,metric) as (
  values ('ai_photo_analysis','ai_photo'),
  ('similar_image_search','ai_search'),
  ('virtual_remodel','ai_virtual'),
  ('cutting_ocr','ai_cutting'),
  ('receipt_ocr','ai_receipt'),
  ('consultation_ocr','ai_consult'),
  ('voice_transcription','ai_voice'),
  ('quick_photo_analysis','ai_quick')
 ), counts as (
  select m.metric,count(distinct r.request_id)::bigint as total
  from feature_map m
  join public.ai_quota_requests r
   on r.feature=m.feature and r.scope_key=p_company::text
  where exists (
   select 1 from public.ai_quota_calls c
   where c.request_id=r.request_id
    and c.provider_status between 200 and 299
  )
  group by m.metric
 )
 select coalesce(jsonb_object_agg(metric,total),'{}'::jsonb)
  || jsonb_build_object('ai_variety',count(*))
 from counts;
$ai$;
revoke all on function public.achievement_ai_metrics(uuid) from public,anon,authenticated;
grant execute on function public.achievement_ai_metrics(uuid) to service_role;
grant select (request_id,scope_key,feature) on public.ai_quota_requests to service_role;
grant select (request_id,provider_status) on public.ai_quota_calls to service_role;

-- 기존 배지의 metric 관련 검사만 새 목록으로 확장합니다.
do $constraints$
declare item record;
begin
 for item in
  select c.conname from pg_constraint c
  where c.conrelid='public.achievement_definitions'::regclass
   and c.contype='c'
   and (
    select a.attnum from pg_attribute a
    where a.attrelid=c.conrelid and a.attname='metric'
   )=any(c.conkey)
 loop
  execute format('alter table public.achievement_definitions drop constraint %I',item.conname);
 end loop;
end;
$constraints$;
alter table public.achievement_definitions
 add constraint achievement_metric_audience_check check (
  (audience='owner' and metric in ('registered_sites','approved_sites','settled_sites','connected_workers','ai_photo','ai_search','ai_virtual','ai_cutting','ai_receipt','ai_consult','ai_voice','ai_quick','ai_variety'))
  or (audience='worker' and metric in ('complete_profile','approved_reports','returned_sites'))
 );

-- 설치된 업적 함수의 기존 로직을 보존하고 AI 집계만 연결합니다.
do $patch$
declare source text; patched text;
begin
 source:=pg_get_functiondef('public.achievement_action(uuid,text,jsonb)'::regprocedure);
 if position('achievement_ai_metrics' in source)=0 then
  if (select count(*) from regexp_matches(source,'for\s+badge\s+in','gi'))<>1 then
   raise exception '업적 함수 구조가 달라 자동 연결을 중단했습니다. 기존 함수 확인이 필요합니다.';
  end if;
  patched:=regexp_replace(source,'for\s+badge\s+in',
   E'if scope = ''owner'' then\n metrics := metrics || public.achievement_ai_metrics(co);\n end if;\n for badge in','i');
  execute patched;
 end if;
end;
$patch$;
revoke all on function public.achievement_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.achievement_action(uuid,text,jsonb) to service_role;

insert into public.achievement_definitions
 (id,title,description,audience,metric,target,art_key,tier,sort_order)
values
('ai_photo_1','AI 첫걸음','AI 서버 성공 응답이 기록된 ai_photo_analysis 요청 1건 (업체 합산)','owner','ai_photo',1,0,'bronze',100),
('ai_photo_30','사진 분석 달인','AI 서버 성공 응답이 기록된 ai_photo_analysis 요청 30건 (업체 합산)','owner','ai_photo',30,0,'gold',101),
('ai_search_1','견적 탐험가','AI 서버 성공 응답이 기록된 similar_image_search 요청 1건 (업체 합산)','owner','ai_search',1,1,'bronze',110),
('ai_search_20','견적 도우미 전문가','AI 서버 성공 응답이 기록된 similar_image_search 요청 20건 (업체 합산)','owner','ai_search',20,1,'gold',111),
('ai_virtual_1','미리 보는 변화','AI 서버 성공 응답이 기록된 virtual_remodel 요청 1건 (업체 합산)','owner','ai_virtual',1,2,'bronze',120),
('ai_virtual_10','공간 디자이너','AI 서버 성공 응답이 기록된 virtual_remodel 요청 10건 (업체 합산)','owner','ai_virtual',10,2,'gold',121),
('ai_cutting_1','스마트 재단 입문','AI 서버 성공 응답이 기록된 cutting_ocr 요청 1건 (업체 합산)','owner','ai_cutting',1,3,'bronze',130),
('ai_cutting_20','재단 기록 달인','AI 서버 성공 응답이 기록된 cutting_ocr 요청 20건 (업체 합산)','owner','ai_cutting',20,3,'gold',131),
('ai_receipt_1','스마트 자재 관리','AI 서버 성공 응답이 기록된 receipt_ocr 요청 1건 (업체 합산)','owner','ai_receipt',1,4,'bronze',140),
('ai_receipt_20','문서 인식 달인','AI 서버 성공 응답이 기록된 receipt_ocr 요청 20건 (업체 합산)','owner','ai_receipt',20,4,'gold',141),
('ai_consult_1','상담 정리 첫걸음','AI 서버 성공 응답이 기록된 consultation_ocr 요청 1건 (업체 합산)','owner','ai_consult',1,5,'bronze',150),
('ai_consult_20','상담 정리 전문가','AI 서버 성공 응답이 기록된 consultation_ocr 요청 20건 (업체 합산)','owner','ai_consult',20,5,'gold',151),
('ai_voice_1','AI 상담 비서 입문','AI 서버 성공 응답이 기록된 voice_transcription 요청 1건 (업체 합산)','owner','ai_voice',1,6,'bronze',160),
('ai_voice_10','AI 상담 비서 전문가','AI 서버 성공 응답이 기록된 voice_transcription 요청 10건 (업체 합산)','owner','ai_voice',10,6,'gold',161),
('ai_quick_1','스마트 기록 입문','AI 서버 성공 응답이 기록된 quick_photo_analysis 요청 1건 (업체 합산)','owner','ai_quick',1,7,'bronze',170),
('ai_quick_20','스마트 기록가','AI 서버 성공 응답이 기록된 quick_photo_analysis 요청 20건 (업체 합산)','owner','ai_quick',20,7,'gold',171),
('ai_variety_3','AI 탐험가','배지 대상 AI 기능 3종 사용 (업체 합산)','owner','ai_variety',3,6,'silver',190),
('ai_variety_5','AI 만능 활용가','배지 대상 AI 기능 5종 사용 (업체 합산)','owner','ai_variety',5,7,'gold',191)
on conflict(id) do nothing;
notify pgrst,'reload schema';
commit;
select 'AI 배지 설정 완료' as result,count(*) as ai_badges
from public.achievement_definitions
where id in ('ai_photo_1','ai_photo_30','ai_search_1','ai_search_20','ai_virtual_1','ai_virtual_10','ai_cutting_1','ai_cutting_20','ai_receipt_1','ai_receipt_20','ai_consult_1','ai_consult_20','ai_voice_1','ai_voice_10','ai_quick_1','ai_quick_20','ai_variety_3','ai_variety_5');
