
-- 1. Effective owner resolver
CREATE OR REPLACE FUNCTION public.effective_owner(_user uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT created_by FROM public.profiles WHERE id = _user AND created_by IS NOT NULL),
    _user
  );
$$;
GRANT EXECUTE ON FUNCTION public.effective_owner(uuid) TO authenticated, anon;

-- 2. Trigger function to rewrite owner_id to the tenant owner
CREATE OR REPLACE FUNCTION public.set_effective_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.owner_id := public.effective_owner(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Apply tenant policy + trigger to every owner-scoped table
DO $$
DECLARE
  t text;
  policy_map jsonb := jsonb_build_object(
    'alertas','Users manage own alertas',
    'alertas_disparos','Users manage own disparos',
    'analises_cadastro','analises_cad_all_own',
    'analises_registradas','anlr_all_own',
    'automation_flows','owners manage own flows',
    'automation_runs','owners manage own runs',
    'equipamentos','equipamentos_all_own',
    'movimentacoes_estoque','mov_all_own',
    'observacoes_producao','obs_all_own',
    'ordem_etapas','owner_all_ordem_etapas',
    'ordens_producao','op_all_own',
    'parametros_cadastro','param_cad_all_own',
    'parametros_registrados','prmr_all_own',
    'produto_atividades','owner_all_atividades',
    'produto_processos','owner_all_processos',
    'produtos','produtos_all_own',
    'tag_endpoints','tag_endpoints_all_own',
    'tags_live','tags_live_all_own',
    'tanques','tanques_all_own'
  );
  old_name text;
BEGIN
  FOR t IN SELECT jsonb_object_keys(policy_map) LOOP
    old_name := policy_map->>t;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_name, t);
    EXECUTE format(
      'CREATE POLICY "tenant access" ON public.%I
         FOR ALL TO authenticated
         USING (owner_id = public.effective_owner(auth.uid()))
         WITH CHECK (owner_id = public.effective_owner(auth.uid()))',
      t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS set_owner_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER set_owner_%I BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner()',
      t, t
    );
  END LOOP;
END $$;
