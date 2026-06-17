
CREATE TABLE public.produto_processos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produto_processos TO authenticated;
GRANT ALL ON public.produto_processos TO service_role;
ALTER TABLE public.produto_processos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_processos" ON public.produto_processos FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_produto_processos_updated BEFORE UPDATE ON public.produto_processos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_produto_processos_produto ON public.produto_processos(produto_id, ordem);

CREATE TABLE public.produto_atividades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  processo_id UUID NOT NULL REFERENCES public.produto_processos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'acao' CHECK (tipo IN ('materia_prima','medicao','acao')),
  quantidade NUMERIC,
  unidade TEXT,
  tempo_estimado_min INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produto_atividades TO authenticated;
GRANT ALL ON public.produto_atividades TO service_role;
ALTER TABLE public.produto_atividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_atividades" ON public.produto_atividades FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_produto_atividades_updated BEFORE UPDATE ON public.produto_atividades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_produto_atividades_processo ON public.produto_atividades(processo_id, ordem);
