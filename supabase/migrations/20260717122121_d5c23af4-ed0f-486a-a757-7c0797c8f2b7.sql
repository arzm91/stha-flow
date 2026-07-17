DROP POLICY IF EXISTS "admin manages calc tags" ON public.tags_calculadas;
DROP POLICY IF EXISTS "owner manages own calc tags" ON public.tags_calculadas;

CREATE POLICY "managers manage any calc tags"
ON public.tags_calculadas
FOR ALL
TO authenticated
USING (public.can_manage_users(auth.uid()))
WITH CHECK (public.can_manage_users(auth.uid()));

CREATE POLICY "owner manages own calc tags"
ON public.tags_calculadas
FOR ALL
TO authenticated
USING (owner_id = public.effective_owner(auth.uid()))
WITH CHECK (owner_id = public.effective_owner(auth.uid()));