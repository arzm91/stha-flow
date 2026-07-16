
-- 1) email_send_state: restrict policy explicitly to service_role
DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state"
  ON public.email_send_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2) push_send_log: restrict INSERT to service_role only
DROP POLICY IF EXISTS "Service role escreve log push" ON public.push_send_log;
CREATE POLICY "Service role escreve log push"
  ON public.push_send_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 3) tags_calculadas: scope admin policy to effective owner
DROP POLICY IF EXISTS "admin manages calc tags" ON public.tags_calculadas;
CREATE POLICY "admin manages calc tags"
  ON public.tags_calculadas
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND owner_id = public.effective_owner(auth.uid()));
