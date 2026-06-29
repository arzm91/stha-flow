
-- Revoke EXECUTE from anon (and PUBLIC) on all SECURITY DEFINER helpers in public schema.
-- These are called by RLS for authenticated users or invoked server-side; anonymous callers should never reach them.
REVOKE EXECUTE ON FUNCTION public.can_access_page(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dispatch_automation_trigger(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.effective_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_tag_alertas(uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ingest_endpoint_payload(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ingest_tags(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.poll_tag_endpoints_fire() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.poll_tag_endpoints_process() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_tag_endpoint_now(uuid) FROM PUBLIC, anon;

-- Re-assert the tenant-isolation fixes in case the previous migration was not retained.
REVOKE UPDATE (created_by) ON public.profiles FROM authenticated, anon;

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND created_by IS NOT DISTINCT FROM (SELECT p.created_by FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS turno_eventos_select_own ON storage.objects;
DROP POLICY IF EXISTS turno_eventos_insert_own ON storage.objects;
DROP POLICY IF EXISTS turno_eventos_update_own ON storage.objects;
DROP POLICY IF EXISTS turno_eventos_delete_own ON storage.objects;

CREATE POLICY turno_eventos_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'turno-eventos'
    AND (storage.foldername(name))[1] = public.effective_owner(auth.uid())::text
  );

CREATE POLICY turno_eventos_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'turno-eventos'
    AND (storage.foldername(name))[1] = public.effective_owner(auth.uid())::text
  );

CREATE POLICY turno_eventos_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'turno-eventos'
    AND (storage.foldername(name))[1] = public.effective_owner(auth.uid())::text
  );

CREATE POLICY turno_eventos_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'turno-eventos'
    AND (storage.foldername(name))[1] = public.effective_owner(auth.uid())::text
  );
