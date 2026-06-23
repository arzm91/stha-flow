
DROP POLICY IF EXISTS "Users manage own alertas" ON public.alertas;
CREATE POLICY "Users manage own alertas" ON public.alertas
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users manage own disparos" ON public.alertas_disparos;
CREATE POLICY "Users manage own disparos" ON public.alertas_disparos
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "owners manage own flows" ON public.automation_flows;
CREATE POLICY "owners manage own flows" ON public.automation_flows
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "owners manage own runs" ON public.automation_runs;
CREATE POLICY "owners manage own runs" ON public.automation_runs
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
