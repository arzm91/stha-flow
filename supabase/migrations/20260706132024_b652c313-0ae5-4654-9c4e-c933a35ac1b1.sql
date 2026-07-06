REVOKE EXECUTE ON FUNCTION public.provisionar_ordem_materiais() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.provisionar_ordem_materiais() TO authenticated, service_role;