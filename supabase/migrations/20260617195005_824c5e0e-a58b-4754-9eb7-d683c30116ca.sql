DROP FUNCTION IF EXISTS public.ingest_tags_admin(jsonb);

CREATE POLICY "Admins can insert tags_live"
  ON public.tags_live FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));