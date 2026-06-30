
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND created_by IS NOT DISTINCT FROM (
    SELECT p.created_by FROM public.profiles p WHERE p.id = auth.uid()
  )
  AND (
    created_by IS NULL
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);
