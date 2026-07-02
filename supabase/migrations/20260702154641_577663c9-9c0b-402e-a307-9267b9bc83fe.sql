
CREATE TABLE public.tanque_ajustes_saldo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  tanque_id uuid NOT NULL REFERENCES public.tanques(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  saldo numeric NOT NULL,
  observacao text,
  ajustado_em timestamptz NOT NULL DEFAULT now(),
  ajustado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tanque_ajustes_saldo_tanque ON public.tanque_ajustes_saldo(tanque_id, ajustado_em DESC);
CREATE INDEX idx_tanque_ajustes_saldo_owner ON public.tanque_ajustes_saldo(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tanque_ajustes_saldo TO authenticated;
GRANT ALL ON public.tanque_ajustes_saldo TO service_role;

ALTER TABLE public.tanque_ajustes_saldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tanque_ajustes_saldo owner all"
ON public.tanque_ajustes_saldo FOR ALL TO authenticated
USING (owner_id = public.effective_owner(auth.uid()))
WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE TRIGGER set_owner_tanque_ajustes_saldo
BEFORE INSERT ON public.tanque_ajustes_saldo
FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER update_tanque_ajustes_saldo_updated_at
BEFORE UPDATE ON public.tanque_ajustes_saldo
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
