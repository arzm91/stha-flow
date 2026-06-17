
CREATE TABLE public.ordem_etapas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  ordem_id UUID NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  processo_id UUID REFERENCES public.produto_processos(id) ON DELETE SET NULL,
  atividade_id UUID REFERENCES public.produto_atividades(id) ON DELETE SET NULL,
  processo_nome TEXT NOT NULL,
  atividade_descricao TEXT,
  tipo TEXT,
  ordem_processo INTEGER NOT NULL DEFAULT 0,
  ordem_atividade INTEGER NOT NULL DEFAULT 0,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  duracao_seg INTEGER,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordem_etapas TO authenticated;
GRANT ALL ON public.ordem_etapas TO service_role;
ALTER TABLE public.ordem_etapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_ordem_etapas" ON public.ordem_etapas FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_ordem_etapas_updated BEFORE UPDATE ON public.ordem_etapas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ordem_etapas_ordem ON public.ordem_etapas(ordem_id, iniciado_em DESC);
