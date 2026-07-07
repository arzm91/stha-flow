
-- 1) profiles: restrict same-tenant read to admins only
DROP POLICY IF EXISTS profiles_select_same_tenant ON public.profiles;
CREATE POLICY profiles_select_same_tenant_admin ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.effective_owner(auth.uid()) = public.effective_owner(id)
    )
  );

-- 2) user_roles: tenant-scoped admin management
DROP POLICY IF EXISTS user_roles_admin_insert ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_update ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_delete ON public.user_roles;

CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.effective_owner(auth.uid()) = public.effective_owner(user_id)
  );

CREATE POLICY user_roles_admin_update ON public.user_roles
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.effective_owner(auth.uid()) = public.effective_owner(user_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.effective_owner(auth.uid()) = public.effective_owner(user_id)
  );

CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.effective_owner(auth.uid()) = public.effective_owner(user_id)
    AND user_id <> auth.uid()  -- prevent admin from deleting own admin role
  );

-- 3) tag_endpoints: force owner_id to caller's tenant, so client-supplied owner_id cannot bypass
DROP TRIGGER IF EXISTS tag_endpoints_set_owner ON public.tag_endpoints;
CREATE TRIGGER tag_endpoints_set_owner
  BEFORE INSERT ON public.tag_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

-- 4) SECURITY DEFINER: revoke public execute on internal trigger helper.
-- Keep has_role / effective_owner / can_access_page executable — they are required by RLS policies.
REVOKE EXECUTE ON FUNCTION public.provisionar_ordem_materiais() FROM PUBLIC, authenticated, anon;
