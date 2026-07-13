-- Helper: can manage users
CREATE OR REPLACE FUNCTION public.can_manage_users(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user, 'admin'::public.app_role)
      OR public.has_role(_user, 'gerente'::public.app_role);
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_users(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_users(uuid) TO authenticated, service_role;

-- Restrict alertas_disparos SELECT by recipient for non-admins
DROP POLICY IF EXISTS "tenant access" ON public.alertas_disparos;

CREATE POLICY "alertas_disparos_admin_all"
  ON public.alertas_disparos FOR ALL TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND public.can_manage_users(auth.uid())
  )
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND public.can_manage_users(auth.uid())
  );

CREATE POLICY "alertas_disparos_recipient_select"
  ON public.alertas_disparos FOR SELECT TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND (
      (alerta_id IS NOT NULL AND alerta_id IN (
        SELECT a.id FROM public.alertas a
        WHERE a.owner_id = public.effective_owner(auth.uid())
          AND (auth.uid() = ANY(COALESCE(a.email_recipients, ARRAY[]::uuid[]))
            OR auth.uid() = ANY(COALESCE(a.push_recipients, ARRAY[]::uuid[])))
      ))
      OR (alerta_id IS NULL AND EXISTS (
        SELECT 1 FROM public.rotinas_atividades r
        WHERE r.owner_id = public.effective_owner(auth.uid())
          AND (public.alertas_disparos.contexto->>'rotina_id')::uuid = r.id
          AND auth.uid() = ANY(COALESCE(r.email_recipients, ARRAY[]::uuid[]))
      ))
    )
  );

CREATE POLICY "alertas_disparos_recipient_update"
  ON public.alertas_disparos FOR UPDATE TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND alerta_id IN (
      SELECT a.id FROM public.alertas a
      WHERE a.owner_id = public.effective_owner(auth.uid())
        AND (auth.uid() = ANY(COALESCE(a.email_recipients, ARRAY[]::uuid[]))
          OR auth.uid() = ANY(COALESCE(a.push_recipients, ARRAY[]::uuid[])))
    )
  )
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));