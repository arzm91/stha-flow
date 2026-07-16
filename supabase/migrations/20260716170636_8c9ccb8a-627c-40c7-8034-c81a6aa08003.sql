DROP POLICY IF EXISTS "admin manages calc tags" ON public.tags_calculadas;
DROP POLICY IF EXISTS "owner manages own calc tags" ON public.tags_calculadas;

CREATE POLICY "admin manages calc tags"
  ON public.tags_calculadas
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "owner manages own calc tags"
  ON public.tags_calculadas
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);