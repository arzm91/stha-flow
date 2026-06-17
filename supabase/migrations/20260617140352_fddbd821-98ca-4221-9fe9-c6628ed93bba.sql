CREATE POLICY "Usuários autenticados podem editar tags"
ON public.tags_live
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);