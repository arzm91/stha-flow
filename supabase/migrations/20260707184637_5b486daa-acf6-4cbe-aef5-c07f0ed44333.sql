-- Restrict same-tenant profile reads to admins only.
DROP POLICY IF EXISTS profiles_select_same_tenant ON public.profiles;