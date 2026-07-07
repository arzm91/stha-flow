
REVOKE EXECUTE ON FUNCTION public.auto_advance_equipamento_atividades() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_advance_equipamento_atividades() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_advance_equipamento_atividades() FROM anon;
GRANT EXECUTE ON FUNCTION public.auto_advance_equipamento_atividades() TO service_role;
