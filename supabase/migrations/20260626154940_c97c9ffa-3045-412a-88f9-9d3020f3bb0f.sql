ALTER TABLE public.relatorio_turno_eventos
  ADD COLUMN IF NOT EXISTS responsavel TEXT,
  ADD COLUMN IF NOT EXISTS imagens TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.relatorio_turno_eventos ALTER COLUMN titulo DROP NOT NULL;