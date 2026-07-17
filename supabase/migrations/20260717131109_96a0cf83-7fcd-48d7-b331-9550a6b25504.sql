
CREATE TABLE IF NOT EXISTS public.op_numero_seq (
  owner_id uuid PRIMARY KEY,
  current_val bigint NOT NULL DEFAULT 99,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.op_numero_seq TO authenticated;
GRANT ALL ON public.op_numero_seq TO service_role;

ALTER TABLE public.op_numero_seq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "op_numero_seq owner read"
ON public.op_numero_seq FOR SELECT TO authenticated
USING (owner_id = public.effective_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.next_op_numero(_owner uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val bigint;
  base_val bigint;
BEGIN
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'owner is required';
  END IF;

  SELECT GREATEST(
    99,
    COALESCE((
      SELECT MAX((numero)::bigint)
      FROM public.ordens_producao
      WHERE owner_id = _owner AND numero ~ '^[0-9]+$'
    ), 99)
  ) INTO base_val;

  INSERT INTO public.op_numero_seq(owner_id, current_val)
  VALUES (_owner, base_val)
  ON CONFLICT (owner_id) DO UPDATE
    SET current_val = GREATEST(public.op_numero_seq.current_val, EXCLUDED.current_val);

  UPDATE public.op_numero_seq
  SET current_val = current_val + 1, updated_at = now()
  WHERE owner_id = _owner
  RETURNING current_val INTO next_val;

  RETURN next_val::text;
END
$$;

REVOKE ALL ON FUNCTION public.next_op_numero(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_op_numero(uuid) TO authenticated, service_role;
