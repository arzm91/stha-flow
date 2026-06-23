
REVOKE EXECUTE ON FUNCTION public.evaluate_tag_alertas(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tags_live_alertas_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_tag_alertas(UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.tags_live_alertas_trigger() TO service_role;
