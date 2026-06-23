
-- Monitoring dashboards
CREATE TABLE public.monitoring_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_dashboards TO authenticated;
GRANT ALL ON public.monitoring_dashboards TO service_role;

ALTER TABLE public.monitoring_dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages dashboards"
ON public.monitoring_dashboards FOR ALL
TO authenticated
USING (owner_id = public.effective_owner(auth.uid()))
WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE TRIGGER set_monitoring_dashboards_owner
BEFORE INSERT ON public.monitoring_dashboards
FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER set_monitoring_dashboards_updated
BEFORE UPDATE ON public.monitoring_dashboards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Widgets
CREATE TABLE public.monitoring_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  dashboard_id UUID NOT NULL REFERENCES public.monitoring_dashboards(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('line','bar','gauge','value')),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{nome, cor, label}]
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- {min,max,unidade,xLabel,yLabel,decimals,...}
  layout JSONB NOT NULL DEFAULT '{"x":0,"y":0,"w":4,"h":4}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_widgets TO authenticated;
GRANT ALL ON public.monitoring_widgets TO service_role;

ALTER TABLE public.monitoring_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages widgets"
ON public.monitoring_widgets FOR ALL
TO authenticated
USING (owner_id = public.effective_owner(auth.uid()))
WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE TRIGGER set_monitoring_widgets_owner
BEFORE INSERT ON public.monitoring_widgets
FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER set_monitoring_widgets_updated
BEFORE UPDATE ON public.monitoring_widgets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_monitoring_widgets_dashboard ON public.monitoring_widgets(dashboard_id);
