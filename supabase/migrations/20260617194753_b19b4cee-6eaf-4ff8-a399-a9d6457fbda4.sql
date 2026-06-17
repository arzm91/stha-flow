CREATE OR REPLACE FUNCTION public.ingest_tags_admin(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.tags_live (nome, valor, valor_num, unidade, grupo, qualidade, atualizado_em, origem)
  SELECT
    (item->>'nome')::text,
    NULLIF(item->>'valor',''),
    CASE WHEN item->>'valor_num' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (item->>'valor_num')::numeric ELSE NULL END,
    NULLIF(item->>'unidade',''),
    NULLIF(item->>'grupo',''),
    NULLIF(item->>'qualidade',''),
    COALESCE((item->>'atualizado_em')::timestamptz, now()),
    COALESCE(NULLIF(item->>'origem',''), 'endpoint')
  FROM jsonb_array_elements(payload) AS item
  WHERE NULLIF(item->>'nome','') IS NOT NULL
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

REVOKE EXECUTE ON FUNCTION public.ingest_tags_admin(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_tags_admin(jsonb) TO authenticated, service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('poll-tag-endpoints');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;