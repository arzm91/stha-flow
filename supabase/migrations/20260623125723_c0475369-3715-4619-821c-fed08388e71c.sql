REVOKE ALL ON public.tag_endpoints FROM anon, PUBLIC;
REVOKE ALL ON public.tags_live FROM anon, PUBLIC;
REVOKE ALL ON public.tag_endpoint_requests FROM anon, authenticated, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_endpoints TO authenticated;
GRANT ALL ON public.tag_endpoints TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags_live TO authenticated;
GRANT ALL ON public.tags_live TO service_role;

GRANT ALL ON public.tag_endpoint_requests TO service_role;