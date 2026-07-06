-- 1) custom_sheet_rows: constrain created_by to auth.uid() (or NULL)
DROP POLICY IF EXISTS "tenant access" ON public.custom_sheet_rows;

CREATE POLICY "tenant read" ON public.custom_sheet_rows
  FOR SELECT TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY "tenant insert" ON public.custom_sheet_rows
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND (created_by IS NULL OR created_by = auth.uid())
  );

CREATE POLICY "tenant update" ON public.custom_sheet_rows
  FOR UPDATE TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND (created_by IS NULL OR created_by = auth.uid())
  );

CREATE POLICY "tenant delete" ON public.custom_sheet_rows
  FOR DELETE TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()));

-- 2) profiles: revoke column-level UPDATE on created_by from client roles.
-- The existing trigger + policy already prevent non-admins from changing it;
-- this adds column-level defense-in-depth so the Data API cannot even accept it.
REVOKE UPDATE (created_by) ON public.profiles FROM anon, authenticated;
-- Keep service_role/admin paths (they use service_role which retains ALL).