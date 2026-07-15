
-- 1) Tighten policies from public to authenticated
DROP POLICY IF EXISTS tenant_access_dashboard_widgets ON public.dashboard_widgets;
CREATE POLICY tenant_access_dashboard_widgets ON public.dashboard_widgets
  FOR ALL TO authenticated
  USING (public.effective_owner(user_id) = public.effective_owner(auth.uid()))
  WITH CHECK (public.effective_owner(user_id) = public.effective_owner(auth.uid()));

DROP POLICY IF EXISTS tenant_access_rotinas ON public.rotinas_atividades;
CREATE POLICY tenant_access_rotinas ON public.rotinas_atividades
  FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

DROP POLICY IF EXISTS "admins manage permissions" ON public.user_permissions;
CREATE POLICY "admins manage permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         AND public.effective_owner(auth.uid()) = public.effective_owner(user_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              AND public.effective_owner(auth.uid()) = public.effective_owner(user_id));

DROP POLICY IF EXISTS "users read own permissions" ON public.user_permissions;
CREATE POLICY "users read own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id
         OR (public.has_role(auth.uid(), 'admin'::public.app_role)
             AND public.effective_owner(auth.uid()) = public.effective_owner(user_id)));

DROP POLICY IF EXISTS "Admins manage resource permissions" ON public.user_resource_permissions;
CREATE POLICY "Admins manage resource permissions" ON public.user_resource_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         AND public.effective_owner(auth.uid()) = public.effective_owner(user_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              AND public.effective_owner(auth.uid()) = public.effective_owner(user_id));

DROP POLICY IF EXISTS "Users read own resource permissions" ON public.user_resource_permissions;
CREATE POLICY "Users read own resource permissions" ON public.user_resource_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR (public.has_role(auth.uid(), 'admin'::public.app_role)
             AND public.effective_owner(auth.uid()) = public.effective_owner(user_id)));

-- 2) report_templates: enforce owner_id server-side
CREATE OR REPLACE FUNCTION public.report_templates_enforce_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória';
  END IF;
  NEW.owner_id := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_templates_enforce_owner() FROM PUBLIC;

DROP TRIGGER IF EXISTS report_templates_enforce_owner_ins ON public.report_templates;
CREATE TRIGGER report_templates_enforce_owner_ins
  BEFORE INSERT ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.report_templates_enforce_owner();

DROP TRIGGER IF EXISTS report_templates_enforce_owner_upd ON public.report_templates;
CREATE TRIGGER report_templates_enforce_owner_upd
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.report_templates_enforce_owner();

-- 3) Revoke direct EXECUTE on trigger-only SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION public.carregamento_baixa_estoque() FROM PUBLIC, authenticated, anon;
