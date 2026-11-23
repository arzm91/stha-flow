ALTER TABLE public.tags_calculadas
  ADD COLUMN IF NOT EXISTS vazao_base text,
  ADD COLUMN IF NOT EXISTS vazao_fator numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS totalizador_ultimo_em timestamptz;
ALTER TABLE public.tags_calculadas DROP CONSTRAINT IF EXISTS tags_calculadas_tipo_check;
ALTER TABLE public.tags_calculadas ADD CONSTRAINT tags_calculadas_tipo_check CHECK (tipo = ANY (ARRAY['formula'::text, 'delta_janela'::text, 'acumulador_janela'::text, 'totalizador_vazao'::text]));