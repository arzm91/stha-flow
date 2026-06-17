CREATE TABLE public.tags_live (
  nome TEXT PRIMARY KEY,
  valor TEXT,
  valor_num NUMERIC,
  unidade TEXT,
  grupo TEXT,
  qualidade TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tags_live TO authenticated;
GRANT ALL ON public.tags_live TO service_role;

ALTER TABLE public.tags_live ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ler tags" ON public.tags_live
  FOR SELECT TO authenticated USING (true);

CREATE INDEX tags_live_grupo_idx ON public.tags_live(grupo);
CREATE INDEX tags_live_atualizado_em_idx ON public.tags_live(atualizado_em DESC);