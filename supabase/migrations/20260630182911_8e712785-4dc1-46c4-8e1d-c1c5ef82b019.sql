
-- 1. Add versioning columns
ALTER TABLE public.produto_processos
  ADD COLUMN IF NOT EXISTS versao INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

-- Partial unique index: only one active version per produto
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_processos_active_unique
  ON public.produto_processos (produto_id)
  WHERE ativo = true;

-- 2. RPC: save a process atomically (archives old active version, creates new)
CREATE OR REPLACE FUNCTION public.save_produto_processo(
  p_produto_id UUID,
  p_nome TEXT,
  p_atividades JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Verify produto belongs to caller's tenant
  SELECT owner_id INTO v_prod_owner FROM public.produtos WHERE id = p_produto_id;
  IF v_prod_owner IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  IF v_prod_owner <> v_owner THEN
    RAISE EXCEPTION 'Sem permissão para alterar este produto';
  END IF;

  -- Compute next version
  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_next_versao
  FROM public.produto_processos WHERE produto_id = p_produto_id;

  -- Archive existing active version(s)
  UPDATE public.produto_processos
  SET ativo = false
  WHERE produto_id = p_produto_id AND ativo = true;

  -- Insert new active version
  INSERT INTO public.produto_processos (owner_id, produto_id, nome, ordem, versao, ativo)
  VALUES (v_owner, p_produto_id, COALESCE(NULLIF(p_nome,''), 'Processo de fabricação'), 0, v_next_versao, true)
  RETURNING id INTO v_new_processo_id;

  -- Insert activities
  IF p_atividades IS NOT NULL AND jsonb_typeof(p_atividades) = 'array' THEN
    FOR v_ativ IN SELECT * FROM jsonb_array_elements(p_atividades) LOOP
      INSERT INTO public.produto_atividades (
        owner_id, processo_id, descricao, ordem, tipo,
        quantidade, unidade, tempo_estimado_min, tag_nome, gatilhos,
        qtd_modo, qtd_tag_nome, captura_modo, captura_gatilho
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
        v_ativ->'captura_gatilho'
      );
    END LOOP;
  END IF;

  RETURN v_new_processo_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_produto_processo(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_produto_processo(UUID, TEXT, JSONB) TO authenticated;

-- 3. Update auto_advance: each order sticks to the processo version it started with;
--    new orders (no etapas yet) use the active version.
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
BEGIN
  FOR op_rec IN
    SELECT id, owner_id, produto_id
    FROM public.ordens_producao
    WHERE status = 'em_andamento' AND produto_id IS NOT NULL
  LOOP
    -- Determine which processo version this order is using:
    -- 1) processo_id already referenced by an existing etapa of this order, OR
    -- 2) the currently active version of the produto
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

REVOKE EXECUTE ON FUNCTION public.auto_advance_ordens_producao() FROM PUBLIC, anon, authenticated;
