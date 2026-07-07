
DROP TABLE IF EXISTS public.relatorio_templates CASCADE;

CREATE TABLE public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'personalizado',
  theme JSONB NOT NULL DEFAULT '{"primary":"#2563eb","font":"Inter"}'::jsonb,
  canvas JSONB NOT NULL DEFAULT '{"pages":[{"id":"p1","blocks":[]}]}'::jsonb,
  page_size TEXT NOT NULL DEFAULT 'A4',
  orientation TEXT NOT NULL DEFAULT 'portrait',
  is_system_template BOOLEAN NOT NULL DEFAULT false,
  equipamento_ids UUID[] NOT NULL DEFAULT '{}',
  produto_ids UUID[] NOT NULL DEFAULT '{}',
  manutencao_ids UUID[] NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO authenticated;
GRANT ALL ON public.report_templates TO service_role;
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_templates_select ON public.report_templates FOR SELECT TO authenticated
  USING (effective_owner(auth.uid()) = effective_owner(owner_id));
CREATE POLICY report_templates_insert ON public.report_templates FOR INSERT TO authenticated
  WITH CHECK (effective_owner(auth.uid()) = effective_owner(owner_id));
CREATE POLICY report_templates_update ON public.report_templates FOR UPDATE TO authenticated
  USING (effective_owner(auth.uid()) = effective_owner(owner_id))
  WITH CHECK (effective_owner(auth.uid()) = effective_owner(owner_id));
CREATE POLICY report_templates_delete ON public.report_templates FOR DELETE TO authenticated
  USING (effective_owner(auth.uid()) = effective_owner(owner_id)
         AND (has_role(auth.uid(),'admin'::app_role) OR created_by = auth.uid()));
CREATE TRIGGER report_templates_set_owner BEFORE INSERT ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE TRIGGER report_templates_updated_at BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX report_templates_owner_idx ON public.report_templates(owner_id);

CREATE TABLE public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  report_id UUID NOT NULL REFERENCES public.report_templates(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  frequencia TEXT NOT NULL DEFAULT 'diaria',
  hora TIME NOT NULL DEFAULT '08:00',
  dias_semana INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  dia_mes INT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  recipient_user_ids UUID[] NOT NULL DEFAULT '{}',
  email_template_key TEXT NOT NULL DEFAULT 'report-ready',
  last_fired_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT ALL ON public.report_schedules TO service_role;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_schedules_select ON public.report_schedules FOR SELECT TO authenticated
  USING (effective_owner(auth.uid()) = effective_owner(owner_id));
CREATE POLICY report_schedules_manage ON public.report_schedules FOR ALL TO authenticated
  USING (effective_owner(auth.uid()) = effective_owner(owner_id))
  WITH CHECK (effective_owner(auth.uid()) = effective_owner(owner_id));
CREATE TRIGGER report_schedules_set_owner BEFORE INSERT ON public.report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE TRIGGER report_schedules_updated_at BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX report_schedules_report_idx ON public.report_schedules(report_id);
CREATE INDEX report_schedules_owner_ativo_idx ON public.report_schedules(owner_id, ativo);

CREATE TABLE public.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  report_id UUID NOT NULL REFERENCES public.report_templates(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.report_schedules(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pdf_path TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'schedule',
  recipient_user_ids UUID[] NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_runs TO authenticated;
GRANT ALL ON public.report_runs TO service_role;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_runs_select ON public.report_runs FOR SELECT TO authenticated
  USING (effective_owner(auth.uid()) = effective_owner(owner_id));
CREATE POLICY report_runs_manage ON public.report_runs FOR ALL TO authenticated
  USING (effective_owner(auth.uid()) = effective_owner(owner_id))
  WITH CHECK (effective_owner(auth.uid()) = effective_owner(owner_id));
CREATE TRIGGER report_runs_set_owner BEFORE INSERT ON public.report_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE INDEX report_runs_report_idx ON public.report_runs(report_id, created_at DESC);
