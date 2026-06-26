
CREATE TABLE public.tanque_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tanque_id uuid NOT NULL REFERENCES public.tanques(id) ON DELETE CASCADE,
  analise_id uuid NOT NULL REFERENCES public.analises_cadastro(id) ON DELETE RESTRICT,
  resultado numeric NOT NULL,
  observacao text,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tanque_analises TO authenticated;
GRANT ALL ON public.tanque_analises TO service_role;

ALTER TABLE public.tanque_analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant access" ON public.tanque_analises
  TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE TRIGGER set_owner_tanque_analises
  BEFORE INSERT ON public.tanque_analises
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER trg_tanque_analises_updated
  BEFORE UPDATE ON public.tanque_analises
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_tanque_analises_tanque ON public.tanque_analises(tanque_id, registrado_em DESC);
