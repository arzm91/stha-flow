ALTER TABLE public.tag_endpoints
ADD COLUMN IF NOT EXISTS push_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_tag_endpoints_push_token
ON public.tag_endpoints(push_token);

COMMENT ON COLUMN public.tag_endpoints.push_token IS 'Token usado para receber tags via POST HTTPS no modo push.';