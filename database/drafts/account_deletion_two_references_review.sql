-- REVIEW ONLY: not applied to production.
-- Account deletion and policy/legal retention must be implemented and verified
-- separately. Existing RLS, triggers, functions, and client behavior require
-- integration testing against a complete replica of the app schema.
BEGIN;
ALTER TABLE public.site_material_issues ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.site_material_issues DROP CONSTRAINT site_material_issues_created_by_fkey;
ALTER TABLE public.site_material_issues ADD CONSTRAINT site_material_issues_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.worker_team_messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.worker_team_messages DROP CONSTRAINT worker_team_messages_sender_id_fkey;
ALTER TABLE public.worker_team_messages ADD CONSTRAINT worker_team_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
COMMIT;
