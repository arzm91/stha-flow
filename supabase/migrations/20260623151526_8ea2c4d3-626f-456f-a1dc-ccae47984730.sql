REVOKE EXECUTE ON FUNCTION public.dispatch_automation_trigger(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tags_live_automation_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ordens_producao_automation_trigger() FROM PUBLIC, anon, authenticated;