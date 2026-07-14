
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.carregamento_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  tag_peso_nome text,
  tag_tara_nome text,
  variacao_min_kg numeric,
  tempo_estabilizacao_seg integer DEFAULT 10,
  unidade text DEFAULT 'kg',
  permitir_ajuste_manual boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carregamento_config TO authenticated;
GRANT ALL ON public.carregamento_config TO service_role;

ALTER TABLE public.carregamento_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carregamento_config own"
  ON public.carregamento_config
  FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER trg_carregamento_config_updated
  BEFORE UPDATE ON public.carregamento_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.carregamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  tanque_id uuid REFERENCES public.tanques(id) ON DELETE SET NULL,
  operador_id uuid,
  operador_nome text,
  modo text NOT NULL DEFAULT 'manual',
  tag_peso_nome text,
  tara numeric,
  peso_inicial numeric,
  peso_final numeric,
  quantidade numeric,
  unidade text DEFAULT 'kg',
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  duracao_seg integer,
  status text NOT NULL DEFAULT 'em_andamento',
  destino text,
  placa_veiculo text,
  motorista text,
  ajuste_manual boolean NOT NULL DEFAULT false,
  motivo_ajuste text,
  observacao text,
  movimentacao_id uuid REFERENCES public.movimentacoes_estoque(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX carregamentos_owner_status_idx ON public.carregamentos(owner_id, status);
CREATE INDEX carregamentos_produto_idx ON public.carregamentos(produto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carregamentos TO authenticated;
GRANT ALL ON public.carregamentos TO service_role;

ALTER TABLE public.carregamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carregamentos select own"
  ON public.carregamentos FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "carregamentos insert own"
  ON public.carregamentos FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "carregamentos update own"
  ON public.carregamentos FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "carregamentos delete admin/gerente"
  ON public.carregamentos FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gerente')
    )
  );

CREATE TRIGGER trg_carregamentos_updated
  BEFORE UPDATE ON public.carregamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.carregamento_baixa_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov_id uuid;
BEGIN
  IF NEW.status = 'concluido'
     AND (OLD.status IS DISTINCT FROM 'concluido')
     AND NEW.movimentacao_id IS NULL
     AND COALESCE(NEW.quantidade, 0) > 0
  THEN
    INSERT INTO public.movimentacoes_estoque
      (owner_id, produto_id, tanque_id, tipo, quantidade, destino, ocorrido_em)
    VALUES
      (NEW.owner_id, NEW.produto_id, NEW.tanque_id, 'saida',
       NEW.quantidade,
       COALESCE(NEW.destino, 'Carregamento ' || NEW.id::text),
       COALESCE(NEW.finalizado_em, now()))
    RETURNING id INTO v_mov_id;
    NEW.movimentacao_id := v_mov_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.carregamento_baixa_estoque() FROM PUBLIC;

CREATE TRIGGER trg_carregamento_baixa
  BEFORE UPDATE ON public.carregamentos
  FOR EACH ROW EXECUTE FUNCTION public.carregamento_baixa_estoque();
