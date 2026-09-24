CREATE OR REPLACE FUNCTION public.dashboard_producao_resumo(
  p_inicio timestamptz,
  p_fim timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT public.effective_owner(auth.uid()) AS owner_id
  ), atual AS (
    SELECT
      count(*)::bigint AS ordens,
      COALESCE(sum(op.qtd_produzida), 0)::numeric AS quantidade
    FROM public.ordens_producao op, scope s
    WHERE op.owner_id = s.owner_id
      AND op.status = 'finalizada'
      AND op.fim_em >= p_inicio
      AND op.fim_em < p_fim
  )
  SELECT jsonb_build_object(
    'ordens', atual.ordens,
    'quantidade', atual.quantidade
  )
  FROM atual;
$$;

REVOKE ALL ON FUNCTION public.dashboard_producao_resumo(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_producao_resumo(timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dashboard_estoque_resumo(
  p_inicio timestamptz,
  p_fim timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT public.effective_owner(auth.uid()) AS owner_id
  ), periodo AS (
    SELECT
      COALESCE(sum(m.quantidade) FILTER (WHERE m.tipo = 'entrada'), 0)::numeric AS entradas,
      COALESCE(sum(m.quantidade) FILTER (WHERE m.tipo = 'saida'), 0)::numeric AS saidas,
      count(*)::bigint AS movimentacoes
    FROM public.movimentacoes_estoque m, scope s
    WHERE m.owner_id = s.owner_id
      AND m.ocorrido_em >= p_inicio
      AND m.ocorrido_em < p_fim
  ), ultimo_ajuste AS (
    SELECT DISTINCT ON (a.tanque_id)
      a.tanque_id,
      a.saldo::numeric AS saldo,
      a.ajustado_em
    FROM public.tanque_ajustes_saldo a, scope s
    WHERE a.owner_id = s.owner_id
    ORDER BY a.tanque_id, a.ajustado_em DESC
  ), saldos_tanque AS (
    SELECT
      t.id AS tanque_id,
      COALESCE(a.saldo, 0)
        + COALESCE(sum(
            CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END
          ) FILTER (WHERE a.ajustado_em IS NULL OR m.ocorrido_em > a.ajustado_em), 0) AS saldo
    FROM public.tanques t
    JOIN scope s ON t.owner_id = s.owner_id
    LEFT JOIN ultimo_ajuste a ON a.tanque_id = t.id
    LEFT JOIN public.movimentacoes_estoque m
      ON m.tanque_id = t.id AND m.owner_id = s.owner_id
    GROUP BY t.id, a.saldo, a.ajustado_em
  ), sem_tanque AS (
    SELECT COALESCE(sum(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END), 0)::numeric AS saldo
    FROM public.movimentacoes_estoque m, scope s
    WHERE m.owner_id = s.owner_id AND m.tanque_id IS NULL
  )
  SELECT jsonb_build_object(
    'entradas', periodo.entradas,
    'saidas', periodo.saidas,
    'movimentacoes', periodo.movimentacoes,
    'saldo', COALESCE((SELECT sum(saldo) FROM saldos_tanque), 0) + sem_tanque.saldo
  )
  FROM periodo, sem_tanque;
$$;

REVOKE ALL ON FUNCTION public.dashboard_estoque_resumo(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_estoque_resumo(timestamptz, timestamptz) TO authenticated, service_role;