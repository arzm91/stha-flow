
-- 1) Lock down profiles.created_by so users cannot escalate via effective_owner()
CREATE OR REPLACE FUNCTION public.profiles_protect_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only allow created_by to be set when the caller is an admin (or system/no auth context)
    IF NEW.created_by IS NOT NULL
       AND auth.uid() IS NOT NULL
       AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      NEW.created_by := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Never allow a self-update to change created_by; only admins via service role/admin RPCs may change it
    IF auth.uid() IS NOT NULL
       AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      NEW.created_by := OLD.created_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_created_by_trg ON public.profiles;
CREATE TRIGGER profiles_protect_created_by_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_created_by();

-- 2) Revoke anon EXECUTE on SECURITY DEFINER helpers that should require auth
REVOKE EXECUTE ON FUNCTION public.effective_owner(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_page(uuid, text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_effective_owner() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.effective_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_page(uuid, text, boolean) TO authenticated;
-- set_effective_owner is a trigger function; no role needs direct EXECUTE.
