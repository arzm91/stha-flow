
REVOKE ALL ON FUNCTION public.auto_advance_ordens_producao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._gatilho_match(numeric, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_advance_ordens_producao() TO service_role;
GRANT EXECUTE ON FUNCTION public._gatilho_match(numeric, text, numeric) TO service_role;
