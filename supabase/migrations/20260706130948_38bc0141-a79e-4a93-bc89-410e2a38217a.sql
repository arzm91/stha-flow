
CREATE OR REPLACE FUNCTION public.tg_relatorio_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.relatorio_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  fonte text NOT NULL CHECK (fonte IN ('producao','estoque_qualidade','manutencao_automacao')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relatorio_templates TO authenticated;
GRANT ALL ON public.relatorio_templates TO service_role;

ALTER TABLE public.relatorio_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users can view templates"
  ON public.relatorio_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins can insert templates"
  ON public.relatorio_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());

CREATE POLICY "admins can update templates"
  ON public.relatorio_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete templates"
  ON public.relatorio_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_relatorio_templates_updated_at
  BEFORE UPDATE ON public.relatorio_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_relatorio_templates_updated_at();

CREATE INDEX idx_relatorio_templates_fonte ON public.relatorio_templates(fonte);
