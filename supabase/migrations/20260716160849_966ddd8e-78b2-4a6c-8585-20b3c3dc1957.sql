
CREATE OR REPLACE FUNCTION public.grant_creator_resource_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := TG_ARGV[0];
  v_creator uuid := NEW.owner_id;
BEGIN
  IF v_creator IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_creator) THEN
    RETURN NEW;
  END IF;
  IF public.has_role(v_creator, 'admin'::app_role)
     OR public.has_role(v_creator, 'gerente'::app_role) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.user_resource_permissions (user_id, resource_type, resource_id)
  VALUES (v_creator, v_type, NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_creator_perm_custom_sheets ON public.custom_sheets;
CREATE TRIGGER trg_grant_creator_perm_custom_sheets
AFTER INSERT ON public.custom_sheets
FOR EACH ROW EXECUTE FUNCTION public.grant_creator_resource_permission('custom_sheet');

DROP TRIGGER IF EXISTS trg_grant_creator_perm_equipamentos ON public.equipamentos;
CREATE TRIGGER trg_grant_creator_perm_equipamentos
AFTER INSERT ON public.equipamentos
FOR EACH ROW EXECUTE FUNCTION public.grant_creator_resource_permission('equipamento');

DROP TRIGGER IF EXISTS trg_grant_creator_perm_tanques ON public.tanques;
CREATE TRIGGER trg_grant_creator_perm_tanques
AFTER INSERT ON public.tanques
FOR EACH ROW EXECUTE FUNCTION public.grant_creator_resource_permission('tanque');

DROP TRIGGER IF EXISTS trg_grant_creator_perm_produtos ON public.produtos;
CREATE TRIGGER trg_grant_creator_perm_produtos
AFTER INSERT ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.grant_creator_resource_permission('produto');

INSERT INTO public.user_resource_permissions (user_id, resource_type, resource_id)
SELECT s.owner_id, 'custom_sheet', s.id
FROM public.custom_sheets s
WHERE s.owner_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.owner_id)
  AND NOT public.has_role(s.owner_id, 'admin'::app_role)
  AND NOT public.has_role(s.owner_id, 'gerente'::app_role)
ON CONFLICT DO NOTHING;
