
-- Helper: compara um valor numérico com um operador e valor referência
CREATE OR REPLACE FUNCTION public._gatilho_match(p_val numeric, p_op text, p_ref numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_val IS NULL THEN false
    WHEN p_op = 'change' THEN true
    WHEN p_ref IS NULL THEN false
    WHEN p_op = 'gt'  THEN p_val >  p_ref
    WHEN p_op = 'lt'  THEN p_val <  p_ref
    WHEN p_op = 'gte' THEN p_val >= p_ref
    WHEN p_op = 'lte' THEN p_val <= p_ref
    WHEN p_op = 'eq'  THEN p_val =  p_ref
    WHEN p_op = 'neq' THEN p_val <> p_ref
    ELSE false
  END;
$$;

-- Função principal: cria/avança etapas automaticamente para todas as OPs em andamento.
-- Regras:
--  * Atividade COM gatilho de início -> inicia quando o gatilho dispara (paralelo).
--  * Atividade SEM gatilho de início -> inicia sequencialmente após a anterior do mesmo
--    processo ter sido finalizada (primeira atividade inicia junto com a OP).
--  * Atividade COM gatilho de fim -> finaliza quando o gatilho dispara (prioridade).
--  * Atividade SEM gatilho de fim -> finaliza ao expirar tempo_estimado_min.
CREATE OR REPLACE FUNCTION public.auto_advance_ordens_producao()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changes int := 0;
  op_rec RECORD;
  proc_rec RECORD;
  ati RECORD;
  etapa_aberta RECORD;
  ativ_anterior RECORD;
  trig jsonb;
  tag_val numeric;
  has_inicio_gat boolean;
  has_fim_gat boolean;
  must_start boolean;
  must_end boolean;
  end_reason text;
  prev_ok boolean;
BEGIN
  FOR op_rec IN
    SELECT id, owner_id, produto_id
    FROM public.ordens_producao
    WHERE status = 'em_andamento' AND produto_id IS NOT NULL
  LOOP
    FOR proc_rec IN
      SELECT id, nome, ordem FROM public.produto_processos
      WHERE produto_id = op_rec.produto_id ORDER BY COALESCE(ordem,0), created_at
    LOOP
      FOR ati IN
        SELECT * FROM public.produto_atividades
        WHERE processo_id = proc_rec.id ORDER BY COALESCE(ordem,0), created_at
      LOOP
        has_inicio_gat := false;
        has_fim_gat := false;
        IF jsonb_typeof(ati.gatilhos) = 'array' THEN
          FOR trig IN SELECT * FROM jsonb_array_elements(ati.gatilhos) LOOP
            IF trig->>'tipo' = 'inicio' THEN has_inicio_gat := true; END IF;
            IF trig->>'tipo' = 'fim'    THEN has_fim_gat    := true; END IF;
          END LOOP;
        END IF;

        SELECT * INTO etapa_aberta
        FROM public.ordem_etapas
        WHERE ordem_id = op_rec.id AND atividade_id = ati.id
        ORDER BY iniciado_em DESC LIMIT 1;

        -- ===== START =====
        IF etapa_aberta.id IS NULL THEN
          must_start := false;

          IF has_inicio_gat THEN
            FOR trig IN SELECT * FROM jsonb_array_elements(ati.gatilhos) LOOP
              IF trig->>'tipo' = 'inicio' THEN
                SELECT valor_num INTO tag_val FROM public.tags_live
                  WHERE owner_id = op_rec.owner_id AND nome = trig->>'tag_nome';
                IF public._gatilho_match(tag_val, trig->>'operador', NULLIF(trig->>'valor','')::numeric) THEN
                  must_start := true; EXIT;
                END IF;
              END IF;
            END LOOP;
          ELSE
            -- sequencial por tempo: precisa que a anterior do mesmo processo esteja finalizada
            SELECT * INTO ativ_anterior FROM public.produto_atividades
              WHERE processo_id = proc_rec.id AND COALESCE(ordem,0) < COALESCE(ati.ordem,0)
              ORDER BY COALESCE(ordem,0) DESC LIMIT 1;
            IF ativ_anterior.id IS NULL THEN
              must_start := true;
            ELSE
              prev_ok := EXISTS(
                SELECT 1 FROM public.ordem_etapas
                WHERE ordem_id = op_rec.id AND atividade_id = ativ_anterior.id
                  AND finalizado_em IS NOT NULL
              );
              IF prev_ok THEN must_start := true; END IF;
            END IF;
          END IF;

          IF must_start THEN
            INSERT INTO public.ordem_etapas(
              owner_id, ordem_id, processo_id, processo_nome, ordem_processo,
              atividade_id, atividade_descricao, tipo, ordem_atividade, iniciado_em,
              observacao
            ) VALUES (
              op_rec.owner_id, op_rec.id, proc_rec.id, proc_rec.nome, COALESCE(proc_rec.ordem,0),
              ati.id, ati.descricao, ati.tipo, COALESCE(ati.ordem,0), now(),
              CASE WHEN has_inicio_gat THEN '[auto: gatilho]' ELSE '[auto: tempo]' END
            );
            changes := changes + 1;
          END IF;
          CONTINUE;
        END IF;

        -- já finalizada? nada a fazer
        IF etapa_aberta.finalizado_em IS NOT NULL THEN CONTINUE; END IF;

        -- ===== END =====
        must_end := false;
        end_reason := NULL;

        IF has_fim_gat THEN
          FOR trig IN SELECT * FROM jsonb_array_elements(ati.gatilhos) LOOP
            IF trig->>'tipo' = 'fim' THEN
              SELECT valor_num INTO tag_val FROM public.tags_live
                WHERE owner_id = op_rec.owner_id AND nome = trig->>'tag_nome';
              IF public._gatilho_match(tag_val, trig->>'operador', NULLIF(trig->>'valor','')::numeric) THEN
                must_end := true; end_reason := 'gatilho fim'; EXIT;
              END IF;
            END IF;
          END LOOP;
        ELSIF COALESCE(ati.tempo_estimado_min, 0) > 0 THEN
          IF now() >= etapa_aberta.iniciado_em + make_interval(mins => ati.tempo_estimado_min) THEN
            must_end := true; end_reason := 'tempo esgotado';
          END IF;
        END IF;

        -- captação de tag sem gatilho nem tempo: encerra imediatamente após registrar
        IF NOT must_end AND ati.tipo = 'tag_captura' AND NOT has_fim_gat
           AND COALESCE(ati.tempo_estimado_min,0) = 0 THEN
          must_end := true; end_reason := 'snapshot';
        END IF;

        IF must_end THEN
          UPDATE public.ordem_etapas
          SET finalizado_em = now(),
              duracao_seg = GREATEST(EXTRACT(EPOCH FROM (now() - iniciado_em))::int, 0),
              observacao = COALESCE(NULLIF(observacao,''), '') ||
                CASE WHEN COALESCE(observacao,'') = '' THEN '' ELSE ' · ' END ||
                '[auto-fim: '||end_reason||']'
          WHERE id = etapa_aberta.id;
          changes := changes + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN changes;
END;
$$;

-- Agendar execução a cada 10 segundos
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-advance-ordens-producao') THEN
    PERFORM cron.unschedule('auto-advance-ordens-producao');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-advance-ordens-producao',
  '10 seconds',
  $cron$ SELECT public.auto_advance_ordens_producao(); $cron$
);
