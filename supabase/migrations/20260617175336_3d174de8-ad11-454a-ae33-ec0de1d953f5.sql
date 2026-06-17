TRUNCATE TABLE public.tags_live;
TRUNCATE TABLE public.tag_endpoints;
DROP FUNCTION IF EXISTS public.upsert_manual_tag(text, text, text, text, text);