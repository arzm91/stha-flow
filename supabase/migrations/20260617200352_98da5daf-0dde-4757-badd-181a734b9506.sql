
revoke all on function public.poll_tag_endpoints_fire() from public, anon, authenticated;
revoke all on function public.poll_tag_endpoints_process() from public, anon, authenticated;
revoke all on function public.ingest_endpoint_payload(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.ingest_tags(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_tags(jsonb) to service_role;
