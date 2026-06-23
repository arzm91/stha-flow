
CREATE TABLE public.custom_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.custom_sheet_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.custom_sheets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX custom_sheet_rows_sheet_id_idx ON public.custom_sheet_rows(sheet_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_sheets TO authenticated;
GRANT ALL ON public.custom_sheets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_sheet_rows TO authenticated;
GRANT ALL ON public.custom_sheet_rows TO service_role;

ALTER TABLE public.custom_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_sheet_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant access" ON public.custom_sheets
  FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY "tenant access" ON public.custom_sheet_rows
  FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE TRIGGER set_owner_custom_sheets BEFORE INSERT ON public.custom_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE TRIGGER set_owner_custom_sheet_rows BEFORE INSERT ON public.custom_sheet_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER custom_sheets_set_updated_at
  BEFORE UPDATE ON public.custom_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER custom_sheet_rows_set_updated_at
  BEFORE UPDATE ON public.custom_sheet_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
