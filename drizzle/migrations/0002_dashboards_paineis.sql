CREATE TABLE public.dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL DEFAULT 'Principal',
  ordem int NOT NULL DEFAULT 0,
  tv_incluir boolean NOT NULL DEFAULT true,
  tv_rotacao_seg int NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboards TO authenticated;
GRANT ALL ON public.dashboards TO service_role;
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dashboards" ON public.dashboards FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER set_dashboards_updated BEFORE UPDATE ON public.dashboards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX dashboards_user_idx ON public.dashboards(user_id, ordem);

ALTER TABLE public.dashboard_widgets ADD COLUMN dashboard_id uuid REFERENCES public.dashboards(id) ON DELETE CASCADE;
CREATE INDEX dashboard_widgets_dashboard_idx ON public.dashboard_widgets(dashboard_id);

INSERT INTO public.dashboards (user_id, nome, ordem)
SELECT DISTINCT user_id, 'Principal', 0 FROM public.dashboard_widgets;
UPDATE public.dashboard_widgets w SET dashboard_id = d.id
FROM public.dashboards d WHERE d.user_id = w.user_id AND w.dashboard_id IS NULL;