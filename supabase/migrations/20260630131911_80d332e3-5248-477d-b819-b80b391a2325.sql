
CREATE TABLE public.user_resource_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('equipamento','tanque','produto','custom_sheet')),
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_type, resource_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_resource_permissions TO authenticated;
GRANT ALL ON public.user_resource_permissions TO service_role;

ALTER TABLE public.user_resource_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own resource permissions"
  ON public.user_resource_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage resource permissions"
  ON public.user_resource_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_resource_perms_user_type ON public.user_resource_permissions(user_id, resource_type);
