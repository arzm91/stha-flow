
CREATE TABLE public.email_templates_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  nome TEXT NOT NULL,
  assunto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('alerta','mensagem','ordem','relatorio')),
  corpo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates_config TO authenticated;
GRANT ALL ON public.email_templates_config TO service_role;

ALTER TABLE public.email_templates_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own email templates"
  ON public.email_templates_config
  FOR ALL
  TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE TRIGGER email_templates_config_set_owner
  BEFORE INSERT ON public.email_templates_config
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER email_templates_config_updated_at
  BEFORE UPDATE ON public.email_templates_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
