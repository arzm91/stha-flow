-- Restrict user_roles writes to admins only (prevent privilege escalation)
CREATE POLICY "Admins can insert user roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update user roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete user roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Explicit deny: ensure no SELECT policy allows non-admins to read tag_endpoints credentials.
-- Current policies are admin-only for ALL; add an explicit admin-only SELECT to be defensive
-- (in case the ALL policy is later split, SELECT remains locked to admins).
DROP POLICY IF EXISTS "Admins can read tag endpoints" ON public.tag_endpoints;
CREATE POLICY "Admins can read tag endpoints"
  ON public.tag_endpoints FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));