
CREATE OR REPLACE FUNCTION public.tags_calculadas_touch_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.tags_calculadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  nome_amigavel TEXT,
  formula TEXT NOT NULL,
  unidade TEXT,
  grupo TEXT,
  decimais INTEGER NOT NULL DEFAULT 2,
  valor_min NUMERIC,
  valor_max NUMERIC,
  ativo BOOLEAN NOT NULL DEFAULT true,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tags_calculadas_owner_nome_unique UNIQUE (owner_id, nome)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags_calculadas TO authenticated;
GRANT ALL ON public.tags_calculadas TO service_role;

ALTER TABLE public.tags_calculadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages own calc tags"
  ON public.tags_calculadas
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "admin manages calc tags"
  ON public.tags_calculadas
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_tags_calculadas_updated
  BEFORE UPDATE ON public.tags_calculadas
  FOR EACH ROW EXECUTE FUNCTION public.tags_calculadas_touch_updated();

CREATE INDEX idx_tags_calculadas_owner ON public.tags_calculadas(owner_id);
