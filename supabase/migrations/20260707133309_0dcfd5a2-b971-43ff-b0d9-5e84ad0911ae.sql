
-- Adiciona políticas de escrita restritas ao tenant para automation_flow_estab_state.
-- A tabela é escrita normalmente por funções SECURITY DEFINER (que ignoram RLS),
-- então na prática nenhum cliente autenticado precisa escrever. As políticas abaixo
-- deixam explícito o fail-closed baseado em owner, alinhando com a política de leitura.
DROP POLICY IF EXISTS own_estab_state_insert ON public.automation_flow_estab_state;
DROP POLICY IF EXISTS own_estab_state_update ON public.automation_flow_estab_state;
DROP POLICY IF EXISTS own_estab_state_delete ON public.automation_flow_estab_state;

CREATE POLICY own_estab_state_insert ON public.automation_flow_estab_state
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY own_estab_state_update ON public.automation_flow_estab_state
  FOR UPDATE TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY own_estab_state_delete ON public.automation_flow_estab_state
  FOR DELETE TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()));
