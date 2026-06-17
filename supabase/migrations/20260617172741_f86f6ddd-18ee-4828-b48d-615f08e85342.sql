
REVOKE EXECUTE ON FUNCTION public.ingest_tags(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_tags(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_tag(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_tag(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_manual_tag(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_manual_tag(text, text, text, text, text) TO authenticated, service_role;
