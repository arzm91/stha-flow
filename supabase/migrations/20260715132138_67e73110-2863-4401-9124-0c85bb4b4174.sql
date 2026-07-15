DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_same_tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR public.effective_owner(auth.uid()) = public.effective_owner(id)
);