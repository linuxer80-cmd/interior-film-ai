BEGIN;
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS case_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.work_items.case_profile IS '시공 사례 공간/부위/구조/모양/손상/시공범위 분류. 빈 객체는 미분류.';
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT '사진 견적 세부 분류 저장 준비 완료' AS result;
