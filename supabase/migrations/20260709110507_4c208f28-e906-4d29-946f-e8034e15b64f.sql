
ALTER TABLE public.tag_endpoints ALTER COLUMN owner_id DROP DEFAULT;
ALTER TABLE public.tags_live ALTER COLUMN owner_id DROP DEFAULT;

DROP TRIGGER IF EXISTS set_effective_owner_tag_endpoints ON public.tag_endpoints;
CREATE TRIGGER set_effective_owner_tag_endpoints
BEFORE INSERT ON public.tag_endpoints
FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

DROP TRIGGER IF EXISTS set_effective_owner_tags_live ON public.tags_live;
CREATE TRIGGER set_effective_owner_tags_live
BEFORE INSERT ON public.tags_live
FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
