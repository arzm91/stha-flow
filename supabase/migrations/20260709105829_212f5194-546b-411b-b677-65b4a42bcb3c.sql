
ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS xlsx_path text,
  ADD COLUMN IF NOT EXISTS formats text[] NOT NULL DEFAULT ARRAY['xlsx']::text[],
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS automation_run_id uuid;
