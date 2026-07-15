
CREATE TABLE public.ordem_trocas_produto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ordem_id UUID NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  produto_anterior_id UUID NOT NULL REFERENCES public.produtos(id),
  produto_novo_id UUID NOT NULL REFERENCES public.produtos(id),
  qtd_produto_anterior NUMERIC NOT NULL CHECK (qtd_produto_anterior >= 0),
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao TEXT,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ordem_trocas_produto_ordem ON public.ordem_trocas_produto(ordem_id, ocorrido_em);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordem_trocas_produto TO authenticated;
GRANT ALL ON public.ordem_trocas_produto TO service_role;

ALTER TABLE public.ordem_trocas_produto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin manages trocas"
  ON public.ordem_trocas_produto FOR ALL TO authenticated
  USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

CREATE OR REPLACE FUNCTION public.tg_ordem_trocas_produto_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

CREATE TRIGGER update_ordem_trocas_produto_updated_at
  BEFORE UPDATE ON public.ordem_trocas_produto
  FOR EACH ROW EXECUTE FUNCTION public.tg_ordem_trocas_produto_touch();
