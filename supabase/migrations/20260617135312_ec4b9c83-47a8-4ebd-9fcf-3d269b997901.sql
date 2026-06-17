CREATE TABLE public.tag_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  metodo TEXT NOT NULL DEFAULT 'GET',
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  body TEXT,
  intervalo_segundos INTEGER NOT NULL DEFAULT 60,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultima_execucao TIMESTAMPTZ,
  ultimo_status TEXT,
  ultimo_erro TEXT,
  tags_recebidas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_endpoints TO authenticated;
GRANT ALL ON public.tag_endpoints TO service_role;

ALTER TABLE public.tag_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage tag endpoints"
ON public.tag_endpoints FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE TRIGGER set_tag_endpoints_updated_at
BEFORE UPDATE ON public.tag_endpoints
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();