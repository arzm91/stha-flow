
-- 1) Configuração por etapa (opcional)
ALTER TABLE public.produto_atividades
  ADD COLUMN IF NOT EXISTS estab_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estab_pct NUMERIC NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS estab_janela_seg INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS estab_min_estavel_seg INT NOT NULL DEFAULT 30;

-- 2) Estado de execução na etapa
ALTER TABLE public.ordem_etapas
  ADD COLUMN IF NOT EXISTS estab_fase TEXT,
  ADD COLUMN IF NOT EXISTS estab_amostras JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estab_estavel_desde TIMESTAMPTZ;

-- 3) Helper: variação % (max-min)/média de uma lista de amostras dentro da janela
CREATE OR REPLACE FUNCTION public._estab_variacao_pct(p_amostras JSONB)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH vals AS (
    SELECT (item->>'v')::numeric AS v
    FROM jsonb_array_elements(COALESCE(p_amostras, '[]'::jsonb)) AS item
    WHERE (item->>'v') ~ '^-?[0-9]+(\.[0-9]+)?$'
  )
  SELECT CASE
    WHEN COUNT(*) < 2 THEN 0
    WHEN (MAX(v) + MIN(v)) = 0 THEN 0
    ELSE ABS(MAX(v) - MIN(v)) / NULLIF((ABS(MAX(v)) + ABS(MIN(v))) / 2.0, 0) * 100.0
  END
  FROM vals;
$$;

-- 4) Atualizar auto_advance_ordens_producao acrescentando o branch de estabilização.
--    Mantém todo o comportamento anterior; o novo branch só atua quando a etapa
--    for matéria-prima, qtd_modo='tag_diferenca', sem gatilhos de início/fim,
--    com estab_enabled=true e qtd_tag_nome definida.
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
  v_locked_proc_id uuid;
  -- estabilização
  v_use_estab boolean;
  v_cur_val numeric;
  v_cur_unid text;
  v_amostras jsonb;
  v_var_pct numeric;
  v_now timestamptz := now();
  v_cutoff timestamptz;
BEGIN
  FOR op_rec IN
    SELECT id, owner_id, produto_id
    FROM public.ordens_producao
    WHERE status = 'em_andamento' AND produto_id IS NOT NULL
  LOOP
    SELECT processo_id INTO v_locked_proc_id
    FROM public.ordem_etapas
    WHERE ordem_id = op_rec.id AND processo_id IS NOT NULL
    ORDER BY iniciado_em ASC
    LIMIT 1;

    IF v_locked_proc_id IS NULL THEN
      SELECT id INTO v_locked_proc_id
      FROM public.produto_processos
      WHERE produto_id = op_rec.produto_id AND ativo = true
      LIMIT 1;
    END IF;

    IF v_locked_proc_id IS NULL THEN CONTINUE; END IF;

    FOR proc_rec IN
      SELECT id, nome, ordem FROM public.produto_processos
      WHERE id = v_locked_proc_id
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

        v_use_estab := (
          ati.tipo = 'materia_prima'
          AND ati.qtd_modo = 'tag_diferenca'
          AND COALESCE(ati.estab_enabled, false) = true
          AND ati.qtd_tag_nome IS NOT NULL
          AND has_inicio_gat = false
          AND has_fim_gat = false
        );

        SELECT * INTO etapa_aberta
        FROM public.ordem_etapas
        WHERE ordem_id = op_rec.id AND atividade_id = ati.id
        ORDER BY iniciado_em DESC LIMIT 1;

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
            IF v_use_estab THEN
              -- Não captura valor_inicio ainda: aguarda variação detectar consumo
              SELECT valor_num, unidade INTO v_cur_val, v_cur_unid FROM public.tags_live
                WHERE owner_id = op_rec.owner_id AND nome = ati.qtd_tag_nome;

              INSERT INTO public.ordem_etapas(
                owner_id, ordem_id, processo_id, processo_nome, ordem_processo,
                atividade_id, atividade_descricao, tipo, ordem_atividade, iniciado_em,
                observacao, unidade,
                estab_fase, estab_amostras, estab_estavel_desde
              ) VALUES (
                op_rec.owner_id, op_rec.id, proc_rec.id, proc_rec.nome, COALESCE(proc_rec.ordem,0),
                ati.id, ati.descricao, ati.tipo, COALESCE(ati.ordem,0), v_now,
                '[auto: aguardando variação da tag]', COALESCE(v_cur_unid, ati.unidade),
                'aguardando_atividade',
                CASE WHEN v_cur_val IS NULL THEN '[]'::jsonb
                     ELSE jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur_val)) END,
                v_now
              );
              changes := changes + 1;
            ELSE
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
                ati.id, ati.descricao, ati.tipo, COALESCE(ati.ordem,0), v_now,
                CASE WHEN has_inicio_gat THEN '[auto: gatilho]' ELSE '[auto: tempo]' END,
                v_inicio,
                COALESCE(v_unid, ati.unidade)
              );
              changes := changes + 1;
            END IF;
          END IF;
          CONTINUE;
        END IF;

        IF etapa_aberta.finalizado_em IS NOT NULL THEN CONTINUE; END IF;

        -- ===== Branch ESTABILIZAÇÃO =====
        IF v_use_estab THEN
          SELECT valor_num INTO v_cur_val FROM public.tags_live
            WHERE owner_id = op_rec.owner_id AND nome = ati.qtd_tag_nome;

          IF v_cur_val IS NULL THEN
            CONTINUE;
          END IF;

          -- Atualiza janela de amostras
          v_cutoff := v_now - make_interval(secs => GREATEST(COALESCE(ati.estab_janela_seg,30), 5));
          SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'t')::timestamptz), '[]'::jsonb)
            INTO v_amostras
            FROM jsonb_array_elements(COALESCE(etapa_aberta.estab_amostras,'[]'::jsonb)) item
            WHERE (item->>'t')::timestamptz >= v_cutoff;

          v_amostras := COALESCE(v_amostras,'[]'::jsonb)
                        || jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur_val));

          v_var_pct := public._estab_variacao_pct(v_amostras);

          IF COALESCE(etapa_aberta.estab_fase, 'aguardando_atividade') = 'aguardando_atividade' THEN
            IF v_var_pct > ati.estab_pct THEN
              -- Detectou início do consumo: captura valor inicial = primeira amostra da janela
              v_inicio := (
                SELECT (item->>'v')::numeric
                FROM jsonb_array_elements(v_amostras) item
                ORDER BY (item->>'t')::timestamptz ASC
                LIMIT 1
              );
              UPDATE public.ordem_etapas
              SET valor_inicio = v_inicio,
                  estab_fase = 'consumindo',
                  estab_amostras = jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur_val)),
                  estab_estavel_desde = v_now,
                  observacao = COALESCE(NULLIF(observacao,''),'') ||
                    CASE WHEN COALESCE(observacao,'')='' THEN '' ELSE ' · ' END ||
                    format('[estab: início detectado var=%s%%, v_ini=%s]', round(v_var_pct,2), v_inicio)
              WHERE id = etapa_aberta.id;
              changes := changes + 1;
            ELSE
              UPDATE public.ordem_etapas
              SET estab_amostras = v_amostras
              WHERE id = etapa_aberta.id;
            END IF;
            CONTINUE;
          END IF;

          IF etapa_aberta.estab_fase = 'consumindo' THEN
            IF v_var_pct <= ati.estab_pct THEN
              IF etapa_aberta.estab_estavel_desde IS NULL THEN
                UPDATE public.ordem_etapas
                SET estab_amostras = v_amostras,
                    estab_estavel_desde = v_now
                WHERE id = etapa_aberta.id;
              ELSIF v_now - etapa_aberta.estab_estavel_desde
                    >= make_interval(secs => GREATEST(COALESCE(ati.estab_min_estavel_seg,30), 5)) THEN
                -- Estabilizou: encerra
                v_fim := v_cur_val;
                v_qtd := v_fim - etapa_aberta.valor_inicio;
                UPDATE public.ordem_etapas
                SET finalizado_em = v_now,
                    duracao_seg = GREATEST(EXTRACT(EPOCH FROM (v_now - iniciado_em))::int, 0),
                    valor_fim = v_fim,
                    valor_capturado = v_qtd,
                    estab_amostras = v_amostras,
                    observacao = COALESCE(NULLIF(observacao,''),'') ||
                      CASE WHEN COALESCE(observacao,'')='' THEN '' ELSE ' · ' END ||
                      format('[estab: estabilizou var=%s%%, v_fim=%s]', round(v_var_pct,2), v_fim)
                WHERE id = etapa_aberta.id;
                changes := changes + 1;
              ELSE
                UPDATE public.ordem_etapas
                SET estab_amostras = v_amostras
                WHERE id = etapa_aberta.id;
              END IF;
            ELSE
              -- Voltou a variar: reseta janela estável
              UPDATE public.ordem_etapas
              SET estab_amostras = v_amostras,
                  estab_estavel_desde = NULL
              WHERE id = etapa_aberta.id;
            END IF;
            CONTINUE;
          END IF;
        END IF;
        -- ===== fim do branch estabilização =====

        must_end := false;
        end_reason := NULL;

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
          IF v_now >= etapa_aberta.iniciado_em + make_interval(mins => ati.tempo_estimado_min) THEN
            must_end := true; end_reason := 'tempo esgotado';
          END IF;
        END IF;

        IF NOT must_end AND ati.tipo = 'tag_captura' AND ati.captura_modo = 'na_execucao'
           AND NOT has_fim_gat AND COALESCE(ati.tempo_estimado_min,0) = 0 THEN
          must_end := true; end_reason := 'snapshot';
        END IF;

        IF must_end THEN
          v_fim := NULL; v_cap := NULL; v_qtd := NULL;

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
          SET finalizado_em = v_now,
              duracao_seg = GREATEST(EXTRACT(EPOCH FROM (v_now - iniciado_em))::int, 0),
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

-- 5) Atualizar save_produto_processo para gravar os novos campos
CREATE OR REPLACE FUNCTION public.save_produto_processo(p_produto_id uuid, p_nome text, p_atividades jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner UUID := public.effective_owner(auth.uid());
  v_prod_owner UUID;
  v_new_processo_id UUID;
  v_next_versao INT;
  v_ativ JSONB;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT owner_id INTO v_prod_owner FROM public.produtos WHERE id = p_produto_id;
  IF v_prod_owner IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  IF v_prod_owner <> v_owner THEN
    RAISE EXCEPTION 'Sem permissão para alterar este produto';
  END IF;

  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_next_versao
  FROM public.produto_processos WHERE produto_id = p_produto_id;

  UPDATE public.produto_processos
  SET ativo = false
  WHERE produto_id = p_produto_id AND ativo = true;

  INSERT INTO public.produto_processos (owner_id, produto_id, nome, ordem, versao, ativo)
  VALUES (v_owner, p_produto_id, COALESCE(NULLIF(p_nome,''), 'Processo de fabricação'), 0, v_next_versao, true)
  RETURNING id INTO v_new_processo_id;

  IF p_atividades IS NOT NULL AND jsonb_typeof(p_atividades) = 'array' THEN
    FOR v_ativ IN SELECT * FROM jsonb_array_elements(p_atividades) LOOP
      INSERT INTO public.produto_atividades (
        owner_id, processo_id, descricao, ordem, tipo,
        quantidade, unidade, tempo_estimado_min, tag_nome, gatilhos,
        qtd_modo, qtd_tag_nome, captura_modo, captura_gatilho,
        estab_enabled, estab_pct, estab_janela_seg, estab_min_estavel_seg
      ) VALUES (
        v_owner,
        v_new_processo_id,
        COALESCE(v_ativ->>'descricao',''),
        COALESCE((v_ativ->>'ordem')::INT, 0),
        COALESCE(v_ativ->>'tipo','acao'),
        NULLIF(v_ativ->>'quantidade','')::NUMERIC,
        NULLIF(v_ativ->>'unidade',''),
        NULLIF(v_ativ->>'tempo_estimado_min','')::INT,
        NULLIF(v_ativ->>'tag_nome',''),
        COALESCE(v_ativ->'gatilhos', '[]'::jsonb),
        COALESCE(v_ativ->>'qtd_modo','fixa'),
        NULLIF(v_ativ->>'qtd_tag_nome',''),
        COALESCE(v_ativ->>'captura_modo','na_execucao'),
        v_ativ->'captura_gatilho',
        COALESCE((v_ativ->>'estab_enabled')::boolean, false),
        COALESCE(NULLIF(v_ativ->>'estab_pct','')::numeric, 2),
        COALESCE(NULLIF(v_ativ->>'estab_janela_seg','')::int, 30),
        COALESCE(NULLIF(v_ativ->>'estab_min_estavel_seg','')::int, 30)
      );
    END LOOP;
  END IF;

  RETURN v_new_processo_id;
END;
$function$;
