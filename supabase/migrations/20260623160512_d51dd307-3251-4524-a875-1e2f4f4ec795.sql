
CREATE TABLE public.relatorio_turno_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  created_by uuid NOT NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  categoria text NOT NULL DEFAULT 'geral',
  titulo text NOT NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relatorio_turno_eventos TO authenticated;
GRANT ALL ON public.relatorio_turno_eventos TO service_role;

ALTER TABLE public.relatorio_turno_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relatorio_turno_eventos_tenant_all"
ON public.relatorio_turno_eventos
FOR ALL
TO authenticated
USING (owner_id = public.effective_owner(auth.uid()))
WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE TRIGGER relatorio_turno_eventos_set_owner
BEFORE INSERT ON public.relatorio_turno_eventos
FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER relatorio_turno_eventos_updated_at
BEFORE UPDATE ON public.relatorio_turno_eventos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_relatorio_turno_eventos_owner_data
ON public.relatorio_turno_eventos (owner_id, ocorrido_em DESC);
