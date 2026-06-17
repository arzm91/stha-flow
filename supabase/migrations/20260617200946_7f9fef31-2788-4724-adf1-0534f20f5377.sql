REVOKE EXECUTE ON FUNCTION public.sync_tag_endpoint_now(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tag_endpoint_now(uuid) TO service_role;