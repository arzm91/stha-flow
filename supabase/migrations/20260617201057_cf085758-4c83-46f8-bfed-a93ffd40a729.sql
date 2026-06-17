DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tag_endpoints_push_token_key'
      AND conrelid = 'public.tag_endpoints'::regclass
  ) THEN
    ALTER TABLE public.tag_endpoints
    ADD CONSTRAINT tag_endpoints_push_token_key UNIQUE (push_token);
  END IF;
END $$;