CREATE TABLE public.parametros_unidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  nome text NOT NULL,
  unidade text,
  grupo text,
  equipamento_id uuid REFERENCES public.equipamentos(id) ON DELETE SET NULL,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  tag_leitura text,
  set_modo text NOT NULL DEFAULT 'manual',
  set_valor numeric,
  set_formula text,
  variaveis jsonb NOT NULL DEFAULT '{}'::jsonb,
  margem_modo text NOT NULL DEFAULT 'abs',
  margem_min numeric,
  margem_max numeric,
  tolerancia_ideal numeric,
  decimais int NOT NULL DEFAULT 2,
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parametros_unidade TO authenticated;
GRANT ALL ON public.parametros_unidade TO service_role;
ALTER TABLE public.parametros_unidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant parametros_unidade" ON public.parametros_unidade FOR ALL TO authenticated
USING (owner_id = public.effective_owner(auth.uid()))
WITH CHECK (owner_id = public.effective_owner(auth.uid()));
CREATE TRIGGER set_parametros_unidade_owner BEFORE INSERT ON public.parametros_unidade
FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE TRIGGER set_parametros_unidade_updated BEFORE UPDATE ON public.parametros_unidade
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX parametros_unidade_owner_idx ON public.parametros_unidade(owner_id, ordem);