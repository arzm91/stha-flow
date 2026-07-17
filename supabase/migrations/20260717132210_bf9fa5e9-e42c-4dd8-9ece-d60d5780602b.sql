
ALTER TABLE public.tags_calculadas
  ADD COLUMN IF NOT EXISTS acumulador_tag_nome text,
  ADD COLUMN IF NOT EXISTS acumulador_reset_tipo text,
  ADD COLUMN IF NOT EXISTS acumulador_reset_hora text,
  ADD COLUMN IF NOT EXISTS acumulador_intervalo_horas integer,
  ADD COLUMN IF NOT EXISTS acumulador_ultimo_valor_fonte numeric,
  ADD COLUMN IF NOT EXISTS acumulador_valor numeric,
  ADD COLUMN IF NOT EXISTS acumulador_janela_inicio timestamptz;
