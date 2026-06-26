ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS pfd_graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb;