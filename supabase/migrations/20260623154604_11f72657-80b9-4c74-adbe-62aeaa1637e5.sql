
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_page(uuid, text, boolean) TO authenticated, anon;
