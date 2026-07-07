
-- Replace the broad profile visibility with tenant-scoped visibility.
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

CREATE POLICY profiles_select_same_tenant ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.effective_owner(auth.uid()) = public.effective_owner(id)
  );

-- Restrict chat message inserts to recipients in the same tenant.
DROP POLICY IF EXISTS chat_insert_as_sender ON public.chat_messages;

CREATE POLICY chat_insert_as_sender ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND sender_id <> recipient_id
    AND public.effective_owner(sender_id) = public.effective_owner(recipient_id)
  );
