
REVOKE ALL ON FUNCTION public.ingest_tags(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_endpoint_payload(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_tags(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_endpoint_payload(uuid, text, jsonb) TO service_role;
