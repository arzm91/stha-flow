ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'producao',
  ADD COLUMN IF NOT EXISTS utilidade_ids UUID[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_categoria_check') THEN
    ALTER TABLE public.equipamentos
      ADD CONSTRAINT equipamentos_categoria_check CHECK (categoria IN ('producao','utilidade'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS equipamentos_categoria_idx ON public.equipamentos (categoria);