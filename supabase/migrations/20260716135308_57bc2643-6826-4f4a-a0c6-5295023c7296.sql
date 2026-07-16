DROP POLICY "paradas delete admin/gerente" ON public.paradas_equipamento;
CREATE POLICY "paradas delete admin/gerente" ON public.paradas_equipamento
FOR DELETE
USING (can_manage_users(auth.uid()) AND owner_id = effective_owner(auth.uid()));