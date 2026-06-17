DROP POLICY IF EXISTS "owner_all_processos" ON public.produto_processos;
CREATE POLICY "owner_all_processos" ON public.produto_processos FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "owner_all_atividades" ON public.produto_atividades;
CREATE POLICY "owner_all_atividades" ON public.produto_atividades FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "owner_all_ordem_etapas" ON public.ordem_etapas;
CREATE POLICY "owner_all_ordem_etapas" ON public.ordem_etapas FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);