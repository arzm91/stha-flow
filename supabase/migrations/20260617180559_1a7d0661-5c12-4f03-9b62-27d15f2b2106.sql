-- Add admin DELETE policy on tags_live so admins can delete via normal RLS
CREATE POLICY "Admins can delete tags_live"
ON public.tags_live
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Drop the SECURITY DEFINER function flagged by the linter
DROP FUNCTION IF EXISTS public.delete_tag(text);