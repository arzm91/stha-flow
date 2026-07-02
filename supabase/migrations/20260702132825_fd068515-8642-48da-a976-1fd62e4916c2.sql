ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS tag_velocidade_producao text,
  ADD COLUMN IF NOT EXISTS tag_producao_total text;