ALTER TABLE public.tanques
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'tanque',
  ADD COLUMN IF NOT EXISTS tag_nivel_nome text,
  ADD COLUMN IF NOT EXISTS tag_nivel_modo text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS cor text;