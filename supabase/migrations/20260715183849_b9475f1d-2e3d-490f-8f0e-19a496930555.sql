-- Lock down SECURITY DEFINER functions in the public schema.
-- Revoke EXECUTE from PUBLIC / anon / authenticated on every SECURITY DEFINER function,
-- then re-grant only to the intentional RPCs used by the app.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true AND n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated;',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant only to intentional client-callable RPCs.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_page(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ordem_producao_cascade(uuid) TO authenticated;
