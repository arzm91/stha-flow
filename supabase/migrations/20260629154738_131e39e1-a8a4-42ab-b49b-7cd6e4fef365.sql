
CREATE TABLE public.producao_tag_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  ordem_id UUID NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  equipamento_id UUID,
  tag_nome TEXT NOT NULL,
  valor_num NUMERIC,
  valor TEXT,
  unidade TEXT,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pth_ordem_tag_ts ON public.producao_tag_historico (ordem_id, tag_nome, registrado_em DESC);
CREATE INDEX idx_pth_owner ON public.producao_tag_historico (owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.producao_tag_historico TO authenticated;
GRANT ALL ON public.producao_tag_historico TO service_role;

ALTER TABLE public.producao_tag_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read producao_tag_historico"
  ON public.producao_tag_historico FOR SELECT TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY "Owners can insert producao_tag_historico"
  ON public.producao_tag_historico FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY "Owners can delete producao_tag_historico"
  ON public.producao_tag_historico FOR DELETE TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()));

-- Trigger: grava histórico das tags do equipamento enquanto há OP em andamento
CREATE OR REPLACE FUNCTION public.record_producao_tag_historico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  last_ts TIMESTAMPTZ;
BEGIN
  IF NEW.valor_num IS NULL THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT op.id AS ordem_id, op.owner_id, e.id AS equipamento_id
    FROM public.ordens_producao op
    JOIN public.equipamentos e ON e.id = op.equipamento_id
    WHERE op.status = 'em_andamento'
      AND op.owner_id = NEW.owner_id
      AND NEW.nome = ANY(e.tag_nomes)
  LOOP
    SELECT MAX(registrado_em) INTO last_ts
    FROM public.producao_tag_historico
    WHERE ordem_id = r.ordem_id AND tag_nome = NEW.nome;

    IF last_ts IS NULL OR NEW.atualizado_em - last_ts >= interval '10 seconds' THEN
      INSERT INTO public.producao_tag_historico
        (owner_id, ordem_id, equipamento_id, tag_nome, valor_num, valor, unidade, registrado_em)
      VALUES
        (r.owner_id, r.ordem_id, r.equipamento_id, NEW.nome, NEW.valor_num, NEW.valor, NEW.unidade,
         COALESCE(NEW.atualizado_em, now()));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_producao_tag_historico ON public.tags_live;
CREATE TRIGGER trg_record_producao_tag_historico
AFTER INSERT OR UPDATE ON public.tags_live
FOR EACH ROW EXECUTE FUNCTION public.record_producao_tag_historico();
