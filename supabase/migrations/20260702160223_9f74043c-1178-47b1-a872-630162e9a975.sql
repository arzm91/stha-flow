
-- 1) Receita: MPs por produto
CREATE TABLE public.produto_receita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  materia_prima_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  percentual numeric NOT NULL DEFAULT 0,
  tag_consumo_nome text,
  ordem int NOT NULL DEFAULT 0,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produto_receita_no_self CHECK (produto_id <> materia_prima_id)
);
CREATE INDEX idx_produto_receita_prod ON public.produto_receita(produto_id, ordem);
CREATE INDEX idx_produto_receita_mp ON public.produto_receita(materia_prima_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produto_receita TO authenticated;
GRANT ALL ON public.produto_receita TO service_role;
ALTER TABLE public.produto_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produto_receita owner all" ON public.produto_receita FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));
CREATE TRIGGER set_owner_produto_receita BEFORE INSERT ON public.produto_receita
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE TRIGGER update_produto_receita_updated_at BEFORE UPDATE ON public.produto_receita
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Reservas por ordem
CREATE TABLE public.ordem_materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  ordem_id uuid NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  materia_prima_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  percentual numeric,
  quantidade_prevista numeric NOT NULL DEFAULT 0,
  quantidade_consumida numeric,
  tanque_id uuid REFERENCES public.tanques(id) ON DELETE SET NULL,
  tag_consumo_nome text,
  consumida boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ordem_materiais_ordem ON public.ordem_materiais(ordem_id);
CREATE INDEX idx_ordem_materiais_mp ON public.ordem_materiais(materia_prima_id) WHERE consumida = false;
CREATE UNIQUE INDEX ux_ordem_materiais_ordem_mp ON public.ordem_materiais(ordem_id, materia_prima_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordem_materiais TO authenticated;
GRANT ALL ON public.ordem_materiais TO service_role;
ALTER TABLE public.ordem_materiais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ordem_materiais owner all" ON public.ordem_materiais FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));
CREATE TRIGGER set_owner_ordem_materiais BEFORE INSERT ON public.ordem_materiais
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE TRIGGER update_ordem_materiais_updated_at BEFORE UPDATE ON public.ordem_materiais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Provisionamento automático
CREATE OR REPLACE FUNCTION public.provisionar_ordem_materiais()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_qtd numeric;
BEGIN
  IF NEW.produto_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('programada','em_andamento') THEN
    RETURN NEW;
  END IF;

  v_qtd := COALESCE(NEW.qtd_planejada, 0);

  FOR r IN
    SELECT materia_prima_id, percentual, tag_consumo_nome
    FROM public.produto_receita
    WHERE produto_id = NEW.produto_id
      AND owner_id = NEW.owner_id
  LOOP
    INSERT INTO public.ordem_materiais(
      owner_id, ordem_id, materia_prima_id, percentual,
      quantidade_prevista, tag_consumo_nome
    ) VALUES (
      NEW.owner_id, NEW.id, r.materia_prima_id, r.percentual,
      GREATEST(v_qtd * COALESCE(r.percentual,0) / 100.0, 0),
      r.tag_consumo_nome
    )
    ON CONFLICT (ordem_id, materia_prima_id) DO UPDATE
      SET percentual = EXCLUDED.percentual,
          quantidade_prevista = CASE WHEN public.ordem_materiais.consumida THEN public.ordem_materiais.quantidade_prevista
                                     ELSE EXCLUDED.quantidade_prevista END,
          tag_consumo_nome = EXCLUDED.tag_consumo_nome;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provisionar_ordem_materiais_ins ON public.ordens_producao;
CREATE TRIGGER trg_provisionar_ordem_materiais_ins
AFTER INSERT ON public.ordens_producao
FOR EACH ROW EXECUTE FUNCTION public.provisionar_ordem_materiais();

DROP TRIGGER IF EXISTS trg_provisionar_ordem_materiais_upd ON public.ordens_producao;
CREATE TRIGGER trg_provisionar_ordem_materiais_upd
AFTER UPDATE OF qtd_planejada, produto_id ON public.ordens_producao
FOR EACH ROW
WHEN (OLD.qtd_planejada IS DISTINCT FROM NEW.qtd_planejada
   OR OLD.produto_id IS DISTINCT FROM NEW.produto_id)
EXECUTE FUNCTION public.provisionar_ordem_materiais();
