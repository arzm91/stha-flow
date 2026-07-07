
-- relatorio_templates: add tenant scoping
DROP POLICY IF EXISTS "admins can delete templates" ON public.relatorio_templates;
DROP POLICY IF EXISTS "admins can insert templates" ON public.relatorio_templates;
DROP POLICY IF EXISTS "admins can update templates" ON public.relatorio_templates;
DROP POLICY IF EXISTS "users view own or admin views all templates" ON public.relatorio_templates;

CREATE POLICY "admins can delete templates" ON public.relatorio_templates
  FOR DELETE USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND effective_owner(auth.uid()) = effective_owner(created_by)
  );

CREATE POLICY "admins can insert templates" ON public.relatorio_templates
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND created_by = auth.uid()
  );

CREATE POLICY "admins can update templates" ON public.relatorio_templates
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND effective_owner(auth.uid()) = effective_owner(created_by)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND effective_owner(auth.uid()) = effective_owner(created_by)
  );

CREATE POLICY "users view own or admin views tenant templates" ON public.relatorio_templates
  FOR SELECT USING (
    created_by = auth.uid()
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND effective_owner(auth.uid()) = effective_owner(created_by)
    )
  );

-- user_permissions: add tenant scoping
DROP POLICY IF EXISTS "admins manage permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "users read own permissions" ON public.user_permissions;

CREATE POLICY "admins manage permissions" ON public.user_permissions
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND effective_owner(auth.uid()) = effective_owner(user_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND effective_owner(auth.uid()) = effective_owner(user_id)
  );

CREATE POLICY "users read own permissions" ON public.user_permissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND effective_owner(auth.uid()) = effective_owner(user_id)
    )
  );

-- user_resource_permissions: add tenant scoping
DROP POLICY IF EXISTS "Admins manage resource permissions" ON public.user_resource_permissions;
DROP POLICY IF EXISTS "Users read own resource permissions" ON public.user_resource_permissions;

CREATE POLICY "Admins manage resource permissions" ON public.user_resource_permissions
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND effective_owner(auth.uid()) = effective_owner(user_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND effective_owner(auth.uid()) = effective_owner(user_id)
  );

CREATE POLICY "Users read own resource permissions" ON public.user_resource_permissions
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND effective_owner(auth.uid()) = effective_owner(user_id)
    )
  );
