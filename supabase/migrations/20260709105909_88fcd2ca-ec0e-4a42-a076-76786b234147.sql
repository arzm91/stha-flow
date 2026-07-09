
DROP POLICY IF EXISTS "reports_owner_read" ON storage.objects;
CREATE POLICY "reports_owner_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "reports_owner_write" ON storage.objects;
CREATE POLICY "reports_owner_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "reports_owner_delete" ON storage.objects;
CREATE POLICY "reports_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'reports' AND (storage.foldername(name))[1] = auth.uid()::text);
