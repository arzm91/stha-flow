DROP POLICY IF EXISTS profiles_select_same_tenant ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR (
    effective_owner(auth.uid()) = effective_owner(id)
    AND public.has_role(auth.uid(), 'admin')
  )
);