
ALTER TABLE public.tags_live
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'push';

CREATE OR REPLACE FUNCTION public.ingest_tags(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total INTEGER := 0;
BEGIN
  INSERT INTO public.tags_live (nome, valor, valor_num, unidade, grupo, qualidade, atualizado_em, origem)
  SELECT
    (item->>'nome')::TEXT,
    NULLIF(item->>'valor',''),
    CASE WHEN item->>'valor_num' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (item->>'valor_num')::NUMERIC ELSE NULL END,
    NULLIF(item->>'unidade',''),
    NULLIF(item->>'grupo',''),
    NULLIF(item->>'qualidade',''),
    COALESCE((item->>'atualizado_em')::TIMESTAMPTZ, now()),
    COALESCE(NULLIF(item->>'origem',''), 'push')
  FROM jsonb_array_elements(payload) AS item
  ON CONFLICT (nome) DO UPDATE SET
    valor = EXCLUDED.valor,
    valor_num = EXCLUDED.valor_num,
    qualidade = EXCLUDED.qualidade,
    atualizado_em = EXCLUDED.atualizado_em,
    unidade = COALESCE(public.tags_live.unidade, EXCLUDED.unidade),
    grupo = COALESCE(public.tags_live.grupo, EXCLUDED.grupo),
    origem = EXCLUDED.origem;
  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_tag(_nome text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  DELETE FROM public.tags_live WHERE nome = _nome;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_manual_tag(
  _nome text,
  _valor text,
  _unidade text DEFAULT NULL,
  _grupo text DEFAULT NULL,
  _nome_amigavel text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _valor ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    v_num := _valor::numeric;
  ELSE
    v_num := NULL;
  END IF;
  INSERT INTO public.tags_live (nome, valor, valor_num, unidade, grupo, nome_amigavel, qualidade, origem, atualizado_em)
  VALUES (_nome, _valor, v_num, NULLIF(_unidade,''), NULLIF(_grupo,''), NULLIF(_nome_amigavel,''), 'good', 'manual', now())
  ON CONFLICT (nome) DO UPDATE SET
    valor = EXCLUDED.valor,
    valor_num = EXCLUDED.valor_num,
    unidade = COALESCE(EXCLUDED.unidade, public.tags_live.unidade),
    grupo = COALESCE(EXCLUDED.grupo, public.tags_live.grupo),
    nome_amigavel = COALESCE(EXCLUDED.nome_amigavel, public.tags_live.nome_amigavel),
    origem = 'manual',
    atualizado_em = now();
END;
$$;
