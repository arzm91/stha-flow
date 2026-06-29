
-- Permitir novo tipo "tag_captura" em atividades, com tag associada
ALTER TABLE public.produto_atividades DROP CONSTRAINT IF EXISTS produto_atividades_tipo_check;
ALTER TABLE public.produto_atividades ADD CONSTRAINT produto_atividades_tipo_check
  CHECK (tipo = ANY (ARRAY['materia_prima'::text,'medicao'::text,'acao'::text,'tag_captura'::text]));
ALTER TABLE public.produto_atividades ADD COLUMN IF NOT EXISTS tag_nome text;

-- Tempo limite por processo
ALTER TABLE public.produto_processos ADD COLUMN IF NOT EXISTS tempo_limite_min integer;

-- Motivo de atraso em etapas
ALTER TABLE public.ordem_etapas ADD COLUMN IF NOT EXISTS motivo_atraso text;
