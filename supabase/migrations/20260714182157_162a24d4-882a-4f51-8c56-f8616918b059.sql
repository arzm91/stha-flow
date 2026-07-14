
REVOKE EXECUTE ON FUNCTION public.tags_live_paradas_evaluate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_paradas_alertas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._parada_condicao(numeric, text, text, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
