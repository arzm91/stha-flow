
-- Defense-in-depth: ensure email infra tables are only accessible via service role
REVOKE ALL ON public.email_send_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.email_send_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.email_unsubscribe_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.suppressed_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_send_state TO service_role;
GRANT ALL ON public.email_send_log TO service_role;
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;
GRANT ALL ON public.suppressed_emails TO service_role;

-- Realign 'reports' bucket storage policies to tenant (effective_owner) model
DROP POLICY IF EXISTS reports_owner_read ON storage.objects;
DROP POLICY IF EXISTS reports_owner_write ON storage.objects;
DROP POLICY IF EXISTS reports_owner_update ON storage.objects;
DROP POLICY IF EXISTS reports_owner_delete ON storage.objects;

CREATE POLICY reports_tenant_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'reports' AND (storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text);

CREATE POLICY reports_tenant_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports' AND (storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text);

CREATE POLICY reports_tenant_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'reports' AND (storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text)
  WITH CHECK (bucket_id = 'reports' AND (storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text);

CREATE POLICY reports_tenant_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'reports' AND (storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text);
