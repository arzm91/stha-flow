
-- tag_endpoints: add BEFORE INSERT trigger to enforce owner_id
DROP TRIGGER IF EXISTS set_effective_owner_tag_endpoints ON public.tag_endpoints;
CREATE TRIGGER set_effective_owner_tag_endpoints
BEFORE INSERT ON public.tag_endpoints
FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

-- rotinas_atividades: align policy with tenant scope + trigger
DROP POLICY IF EXISTS own_rotinas_all ON public.rotinas_atividades;
CREATE POLICY tenant_access_rotinas ON public.rotinas_atividades
FOR ALL
USING (owner_id = public.effective_owner(auth.uid()))
WITH CHECK (owner_id = public.effective_owner(auth.uid()));

DROP TRIGGER IF EXISTS set_effective_owner_rotinas_atividades ON public.rotinas_atividades;
CREATE TRIGGER set_effective_owner_rotinas_atividades
BEFORE INSERT ON public.rotinas_atividades
FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

-- dashboard_widgets: tenant-scope policy so members share tenant widgets
DROP POLICY IF EXISTS "Usuário gerencia seus próprios widgets do dashboard" ON public.dashboard_widgets;
CREATE POLICY tenant_access_dashboard_widgets ON public.dashboard_widgets
FOR ALL
USING (public.effective_owner(user_id) = public.effective_owner(auth.uid()))
WITH CHECK (public.effective_owner(user_id) = public.effective_owner(auth.uid()));
