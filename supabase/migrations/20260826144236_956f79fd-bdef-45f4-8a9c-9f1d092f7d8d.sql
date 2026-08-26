DROP POLICY IF EXISTS tenant_access_dashboard_widgets ON public.dashboard_widgets;

CREATE POLICY user_own_dashboard_widgets ON public.dashboard_widgets
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());