
-- Fix 1: prevent users from changing profiles.created_by (privilege escalation via effective_owner)
REVOKE UPDATE (created_by) ON public.profiles FROM authenticated, anon;

-- Also tighten policy so any attempt to set created_by to a different value is rejected at RLS
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND created_by IS NOT DISTINCT FROM (SELECT p.created_by FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Fix 2: Scope turno-eventos storage policies to the tenant (effective owner), not the uploading user
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
