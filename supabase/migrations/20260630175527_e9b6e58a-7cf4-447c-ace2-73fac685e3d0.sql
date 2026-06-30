
-- 1) Schema additions
ALTER TABLE public.produto_atividades
  ADD COLUMN IF NOT EXISTS qtd_modo text NOT NULL DEFAULT 'fixa',
  ADD COLUMN IF NOT EXISTS qtd_tag_nome text,
  ADD COLUMN IF NOT EXISTS captura_modo text NOT NULL DEFAULT 'na_execucao',
  ADD COLUMN IF NOT EXISTS captura_gatilho jsonb;

DO $$ BEGIN
  ALTER TABLE public.produto_atividades
    ADD CONSTRAINT produto_atividades_qtd_modo_check
    CHECK (qtd_modo IN ('fixa','tag_valor','tag_diferenca'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.produto_atividades
    ADD CONSTRAINT produto_atividades_captura_modo_check
    CHECK (captura_modo IN ('na_execucao','gatilho_valor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ordem_etapas
  ADD COLUMN IF NOT EXISTS valor_inicio numeric,
  ADD COLUMN IF NOT EXISTS valor_fim numeric,
  ADD COLUMN IF NOT EXISTS valor_capturado numeric,
  ADD COLUMN IF NOT EXISTS unidade text;

-- 2) Updated auto-advance engine
CREATE OR REPLACE FUNCTION public.auto_advance_ordens_producao()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_inicio numeric;
  v_fim numeric;
  v_cap numeric;
  v_qtd numeric;
  v_unid text;
  cap_match boolean;
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
          v_inicio := NULL;

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
            -- snapshot inicial p/ matéria-prima em modo tag_diferenca
            IF ati.tipo = 'materia_prima' AND ati.qtd_modo = 'tag_diferenca' AND ati.qtd_tag_nome IS NOT NULL THEN
              SELECT valor_num, unidade INTO v_inicio, v_unid FROM public.tags_live
                WHERE owner_id = op_rec.owner_id AND nome = ati.qtd_tag_nome;
            END IF;

            INSERT INTO public.ordem_etapas(
              owner_id, ordem_id, processo_id, processo_nome, ordem_processo,
              atividade_id, atividade_descricao, tipo, ordem_atividade, iniciado_em,
              observacao, valor_inicio, unidade
            ) VALUES (
              op_rec.owner_id, op_rec.id, proc_rec.id, proc_rec.nome, COALESCE(proc_rec.ordem,0),
              ati.id, ati.descricao, ati.tipo, COALESCE(ati.ordem,0), now(),
              CASE WHEN has_inicio_gat THEN '[auto: gatilho]' ELSE '[auto: tempo]' END,
              v_inicio,
              COALESCE(v_unid, ati.unidade)
            );
            changes := changes + 1;
          END IF;
          CONTINUE;
        END IF;

        IF etapa_aberta.finalizado_em IS NOT NULL THEN CONTINUE; END IF;

        -- ===== END =====
        must_end := false;
        end_reason := NULL;

        -- captura por condição de valor (tag_captura modo gatilho_valor)
        IF ati.tipo = 'tag_captura' AND ati.captura_modo = 'gatilho_valor'
           AND ati.captura_gatilho IS NOT NULL AND ati.tag_nome IS NOT NULL THEN
          SELECT valor_num INTO tag_val FROM public.tags_live
            WHERE owner_id = op_rec.owner_id AND nome = ati.tag_nome;
          cap_match := public._gatilho_match(
            tag_val,
            ati.captura_gatilho->>'operador',
            NULLIF(ati.captura_gatilho->>'valor','')::numeric
          );
          IF cap_match THEN
            must_end := true; end_reason := 'condição da tag';
          END IF;
        END IF;

        IF NOT must_end AND has_fim_gat THEN
          FOR trig IN SELECT * FROM jsonb_array_elements(ati.gatilhos) LOOP
            IF trig->>'tipo' = 'fim' THEN
              SELECT valor_num INTO tag_val FROM public.tags_live
                WHERE owner_id = op_rec.owner_id AND nome = trig->>'tag_nome';
              IF public._gatilho_match(tag_val, trig->>'operador', NULLIF(trig->>'valor','')::numeric) THEN
                must_end := true; end_reason := 'gatilho fim'; EXIT;
              END IF;
            END IF;
          END LOOP;
        END IF;

        IF NOT must_end AND NOT has_fim_gat
           AND NOT (ati.tipo='tag_captura' AND ati.captura_modo='gatilho_valor')
           AND COALESCE(ati.tempo_estimado_min, 0) > 0 THEN
          IF now() >= etapa_aberta.iniciado_em + make_interval(mins => ati.tempo_estimado_min) THEN
            must_end := true; end_reason := 'tempo esgotado';
          END IF;
        END IF;

        IF NOT must_end AND ati.tipo = 'tag_captura' AND ati.captura_modo = 'na_execucao'
           AND NOT has_fim_gat AND COALESCE(ati.tempo_estimado_min,0) = 0 THEN
          must_end := true; end_reason := 'snapshot';
        END IF;

        IF must_end THEN
          v_fim := NULL; v_cap := NULL; v_qtd := NULL;

          -- snapshot final / quantidade real p/ matéria-prima
          IF ati.tipo = 'materia_prima' AND ati.qtd_tag_nome IS NOT NULL
             AND ati.qtd_modo IN ('tag_valor','tag_diferenca') THEN
            SELECT valor_num INTO v_fim FROM public.tags_live
              WHERE owner_id = op_rec.owner_id AND nome = ati.qtd_tag_nome;
            IF v_fim IS NULL THEN
              INSERT INTO public.alertas_disparos(owner_id, alerta_nome, severidade, mensagem, contexto)
              VALUES (op_rec.owner_id, 'Captura de tag falhou', 'warning',
                format('Etapa "%s": tag "%s" sem valor numérico no encerramento', ati.descricao, ati.qtd_tag_nome),
                jsonb_build_object('ordem_id', op_rec.id, 'atividade_id', ati.id, 'tag_nome', ati.qtd_tag_nome));
            END IF;
            IF ati.qtd_modo = 'tag_diferenca' THEN
              IF v_fim IS NOT NULL AND etapa_aberta.valor_inicio IS NOT NULL THEN
                v_qtd := v_fim - etapa_aberta.valor_inicio;
              END IF;
            ELSE
              v_qtd := v_fim;
            END IF;
          END IF;

          -- captura de tag (tipo tag_captura)
          IF ati.tipo = 'tag_captura' AND ati.tag_nome IS NOT NULL THEN
            SELECT valor_num INTO v_cap FROM public.tags_live
              WHERE owner_id = op_rec.owner_id AND nome = ati.tag_nome;
            IF v_cap IS NULL THEN
              INSERT INTO public.alertas_disparos(owner_id, alerta_nome, severidade, mensagem, contexto)
              VALUES (op_rec.owner_id, 'Captura de tag falhou', 'warning',
                format('Etapa "%s": tag "%s" sem valor numérico na captura', ati.descricao, ati.tag_nome),
                jsonb_build_object('ordem_id', op_rec.id, 'atividade_id', ati.id, 'tag_nome', ati.tag_nome));
            END IF;
          END IF;

          UPDATE public.ordem_etapas
          SET finalizado_em = now(),
              duracao_seg = GREATEST(EXTRACT(EPOCH FROM (now() - iniciado_em))::int, 0),
              valor_fim = COALESCE(v_fim, valor_fim),
              valor_capturado = COALESCE(v_cap, v_qtd, valor_capturado),
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
$function$;
