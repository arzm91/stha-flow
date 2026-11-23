ALTER TABLE public.ordens_producao ADD COLUMN IF NOT EXISTS editado_em timestamptz, ADD COLUMN IF NOT EXISTS editado_por uuid, ADD COLUMN IF NOT EXISTS editado_por_nome text;
CREATE TABLE public.ordem_edicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT public.effective_owner(auth.uid()),
  ordem_id uuid NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  user_nome text,
  motivo text,
  alteracoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ordem_edicoes(ordem_id, created_at DESC);
GRANT SELECT, INSERT ON public.ordem_edicoes TO authenticated;
GRANT ALL ON public.ordem_edicoes TO service_role;
ALTER TABLE public.ordem_edicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.ordem_edicoes FOR SELECT TO authenticated USING (owner_id = public.effective_owner(auth.uid()));
CREATE POLICY "tenant insert" ON public.ordem_edicoes FOR INSERT TO authenticated WITH CHECK (owner_id = public.effective_owner(auth.uid()) AND user_id = auth.uid());