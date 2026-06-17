ALTER TABLE public.tags_live ADD COLUMN IF NOT EXISTS nome_amigavel text;

CREATE OR REPLACE FUNCTION public.ingest_tags(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  total INTEGER := 0;
BEGIN
  INSERT INTO public.tags_live (nome, valor, valor_num, unidade, grupo, qualidade, atualizado_em)
  SELECT
    (item->>'nome')::TEXT,
    NULLIF(item->>'valor',''),
    CASE WHEN item->>'valor_num' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (item->>'valor_num')::NUMERIC ELSE NULL END,
    NULLIF(item->>'unidade',''),
    NULLIF(item->>'grupo',''),
    NULLIF(item->>'qualidade',''),
    COALESCE((item->>'atualizado_em')::TIMESTAMPTZ, now())
  FROM jsonb_array_elements(payload) AS item
  ON CONFLICT (nome) DO UPDATE SET
    valor = EXCLUDED.valor,
    valor_num = EXCLUDED.valor_num,
    qualidade = EXCLUDED.qualidade,
    atualizado_em = EXCLUDED.atualizado_em,
    unidade = COALESCE(public.tags_live.unidade, EXCLUDED.unidade),
    grupo = COALESCE(public.tags_live.grupo, EXCLUDED.grupo);
  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$function$;