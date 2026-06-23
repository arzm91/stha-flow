
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER user_permissions_set_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_access_page(_user uuid, _page text, _need_edit boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user AND page_key = _page
        AND can_view = true
        AND (NOT _need_edit OR can_edit = true)
    );
$$;
