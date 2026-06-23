
REVOKE EXECUTE ON FUNCTION public.profiles_protect_created_by() FROM anon, authenticated, PUBLIC;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (nome, empresa, email, updated_at) ON public.profiles TO authenticated;
