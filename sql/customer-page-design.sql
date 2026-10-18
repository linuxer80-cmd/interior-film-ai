BEGIN;
-- Additive change; existing profile RLS policies continue to apply.
ALTER TABLE public.company_public_profiles
 ADD COLUMN IF NOT EXISTS design_id text NOT NULL DEFAULT 'natural-oak';
ALTER TABLE public.company_public_profiles DROP CONSTRAINT IF EXISTS company_public_profiles_design_id_check;
ALTER TABLE public.company_public_profiles ADD CONSTRAINT company_public_profiles_design_id_check CHECK (design_id IN ('natural-oak','natural-sage','natural-linen','natural-clay','modern-white','modern-slate','modern-blue','modern-mono','premium-gold','premium-navy','premium-emerald','premium-burgundy','photo-wide','photo-grid','photo-story','photo-gallery'));
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT '고객페이지 16종 디자인 설정 완료' AS result;
