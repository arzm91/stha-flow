
-- PCP: programação de ordens de produção
ALTER TABLE public.ordens_producao
  ADD COLUMN IF NOT EXISTS inicio_previsto timestamptz,
  ADD COLUMN IF NOT EXISTS duracao_estimada_min integer,
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS fila_posicao integer,
  ADD COLUMN IF NOT EXISTS auto_iniciar boolean NOT NULL DEFAULT false;

-- Permitir inicio_em nulo para ordens ainda não iniciadas (status='programada')
ALTER TABLE public.ordens_producao ALTER COLUMN inicio_em DROP NOT NULL;
ALTER TABLE public.ordens_producao ALTER COLUMN inicio_em DROP DEFAULT;

-- Validação leve dos novos campos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordens_producao_prioridade_check'
  ) THEN
    ALTER TABLE public.ordens_producao
      ADD CONSTRAINT ordens_producao_prioridade_check
      CHECK (prioridade IN ('alta','media','baixa'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordens_producao_status_check'
  ) THEN
    ALTER TABLE public.ordens_producao
      ADD CONSTRAINT ordens_producao_status_check
      CHECK (status IN ('programada','em_andamento','finalizada','cancelada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ordens_producao_fila
  ON public.ordens_producao (equipamento_id, status, fila_posicao);

CREATE INDEX IF NOT EXISTS idx_ordens_producao_inicio_previsto
  ON public.ordens_producao (inicio_previsto)
  WHERE status = 'programada';
