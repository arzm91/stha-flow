
ALTER TABLE public.alertas_disparos
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'alerta',
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_por uuid REFERENCES auth.users(id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alertas_disparos_categoria_check'
  ) THEN
    ALTER TABLE public.alertas_disparos
      ADD CONSTRAINT alertas_disparos_categoria_check
      CHECK (categoria IN ('alerta','aviso','tarefa'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_disparos_categoria_status
  ON public.alertas_disparos (owner_id, categoria, status, created_at DESC);

ALTER TABLE public.ordens_producao
  DROP CONSTRAINT IF EXISTS ordens_producao_status_check;
ALTER TABLE public.ordens_producao
  ADD CONSTRAINT ordens_producao_status_check
  CHECK (status IN ('programada','em_andamento','finalizada','cancelada'));
