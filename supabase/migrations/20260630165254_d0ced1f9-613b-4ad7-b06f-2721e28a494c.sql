
-- 1) Revoke EXECUTE on trigger-only SECURITY DEFINER functions from public/authenticated.
-- These are invoked by table triggers and must not be callable directly by signed-in users.
REVOKE EXECUTE ON FUNCTION public.set_effective_owner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_effective_owner() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_effective_owner() FROM anon;

REVOKE EXECUTE ON FUNCTION public.record_producao_tag_historico() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_producao_tag_historico() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_producao_tag_historico() FROM anon;

-- Also harden other trigger-only SECURITY DEFINER functions defensively
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.profiles_protect_created_by() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.ordens_producao_automation_trigger() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.tags_live_automation_trigger() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.tags_live_alertas_trigger() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_analise_alertas() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_parametro_alertas() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_processo_alertas() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_tag_alertas(uuid, text, numeric, text, text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.ignore_tag_endpoint_platform_403() FROM PUBLIC, authenticated, anon;

-- 2) Reinforce profile update protection: drop and recreate policy with strict WITH CHECK,
-- and ensure created_by cannot be changed by non-admins under any condition.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR created_by IS NOT DISTINCT FROM (
        SELECT p.created_by FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR created_by IS NULL
      OR created_by = auth.uid()
    )
  );

-- Ensure the BEFORE-UPDATE protective trigger exists and blocks any change for non-admins.
DROP TRIGGER IF EXISTS profiles_protect_created_by_trg ON public.profiles;
CREATE TRIGGER profiles_protect_created_by_trg
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_created_by();
