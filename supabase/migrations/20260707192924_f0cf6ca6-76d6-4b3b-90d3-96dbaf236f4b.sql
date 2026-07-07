ALTER TABLE public.report_templates
  ADD COLUMN IF NOT EXISTS tanque_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS analise_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];