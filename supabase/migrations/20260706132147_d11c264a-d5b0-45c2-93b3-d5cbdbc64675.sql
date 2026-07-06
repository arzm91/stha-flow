DROP POLICY IF EXISTS "auth users can view templates" ON public.relatorio_templates;
CREATE POLICY "users view own or admin views all templates"
ON public.relatorio_templates
FOR SELECT
TO authenticated
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));