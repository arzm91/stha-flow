
-- Fix tenant scoping for carregamento_config
DROP POLICY IF EXISTS "carregamento_config own" ON public.carregamento_config;
CREATE POLICY "carregamento_config tenant" ON public.carregamento_config
  FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

-- Fix tenant scoping for carregamentos
DROP POLICY IF EXISTS "carregamentos select own" ON public.carregamentos;
DROP POLICY IF EXISTS "carregamentos insert own" ON public.carregamentos;
DROP POLICY IF EXISTS "carregamentos update own" ON public.carregamentos;
DROP POLICY IF EXISTS "carregamentos delete admin/gerente" ON public.carregamentos;

CREATE POLICY "carregamentos select tenant" ON public.carregamentos
  FOR SELECT TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()));
CREATE POLICY "carregamentos insert tenant" ON public.carregamentos
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));
CREATE POLICY "carregamentos update tenant" ON public.carregamentos
  FOR UPDATE TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));
CREATE POLICY "carregamentos delete tenant admin/gerente" ON public.carregamentos
  FOR DELETE TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gerente'::public.app_role))
  );

-- Add reports bucket UPDATE policy (ownership-scoped, matching read/write)
CREATE POLICY "reports_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'reports') AND ((storage.foldername(name))[1] = (auth.uid())::text))
  WITH CHECK ((bucket_id = 'reports') AND ((storage.foldername(name))[1] = (auth.uid())::text));

-- Revoke public EXECUTE on SECURITY DEFINER functions callable by anon
REVOKE EXECUTE ON FUNCTION public.can_manage_users(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.carregamento_baixa_estoque() FROM PUBLIC, anon;
