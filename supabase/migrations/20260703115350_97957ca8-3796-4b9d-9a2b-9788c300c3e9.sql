
-- 1) Tabela de atividades por equipamento
CREATE TABLE IF NOT EXISTS public.equipamento_atividades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  equipamento_id uuid NOT NULL REFERENCES public.equipamentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  tipo text NOT NULL DEFAULT 'acao'
    CHECK (tipo IN ('materia_prima','medicao','acao','tag_captura')),
  ativo boolean NOT NULL DEFAULT true,
  modo_execucao text NOT NULL DEFAULT 'ordem'
    CHECK (modo_execucao IN ('ordem','continuo')),
  tempo_estimado_min integer,
  unidade text,
  quantidade numeric,
  tag_nome text,
  gatilhos jsonb NOT NULL DEFAULT '[]'::jsonb,
  qtd_modo text NOT NULL DEFAULT 'fixa'
    CHECK (qtd_modo IN ('fixa','tag_valor','tag_diferenca')),
  qtd_tag_nome text,
  captura_modo text NOT NULL DEFAULT 'na_execucao'
    CHECK (captura_modo IN ('na_execucao','gatilho_valor')),
  captura_gatilho jsonb,
  estab_enabled boolean NOT NULL DEFAULT false,
  estab_pct numeric NOT NULL DEFAULT 2,
  estab_janela_seg integer NOT NULL DEFAULT 30,
  estab_min_estavel_seg integer NOT NULL DEFAULT 30,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipamento_atividades TO authenticated;
GRANT ALL ON public.equipamento_atividades TO service_role;

ALTER TABLE public.equipamento_atividades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant access" ON public.equipamento_atividades
  FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE TRIGGER set_owner_equipamento_atividades
  BEFORE INSERT ON public.equipamento_atividades
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER trg_equipamento_atividades_updated
  BEFORE UPDATE ON public.equipamento_atividades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_equipamento_atividades_equip
  ON public.equipamento_atividades(equipamento_id, ativo);

-- 2) Vínculo em ordem_etapas
ALTER TABLE public.ordem_etapas
  ADD COLUMN IF NOT EXISTS equipamento_atividade_id uuid
  REFERENCES public.equipamento_atividades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ordem_etapas_equip_atividade
  ON public.ordem_etapas(equipamento_atividade_id);

-- 3) Guard: existe atividade de equipamento ativa?
CREATE OR REPLACE FUNCTION public._equip_tem_atividades(p_owner uuid, p_equip uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.equipamento_atividades
    WHERE owner_id = p_owner AND equipamento_id = p_equip AND ativo = true
  );
$$;

-- 4) Ajusta auto_advance_ordens_producao para pular quando o equipamento tem atividades
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
  v_use_estab boolean;
  v_cur_val numeric;
  v_cur_unid text;
  v_amostras jsonb;
  v_var_pct numeric;
  v_now timestamptz := now();
  v_cutoff timestamptz;
BEGIN
  FOR op_rec IN
    SELECT id, owner_id, produto_id, equipamento_id
    FROM public.ordens_producao
    WHERE status = 'em_andamento' AND produto_id IS NOT NULL
  LOOP
    -- NOVO: se o equipamento da ordem tem atividades próprias, o produto vira fallback (pula)
    IF op_rec.equipamento_id IS NOT NULL
       AND public._equip_tem_atividades(op_rec.owner_id, op_rec.equipamento_id) THEN
      CONTINUE;
    END IF;

    SELECT processo_id INTO v_locked_proc_id
    FROM public.ordem_etapas
    WHERE ordem_id = op_rec.id AND processo_id IS NOT NULL
    ORDER BY iniciado_em ASC LIMIT 1;

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
              prev_ok := EXISTS(SELECT 1 FROM public.ordem_etapas
                WHERE ordem_id = op_rec.id AND atividade_id = ativ_anterior.id
                  AND finalizado_em IS NOT NULL);
              IF prev_ok THEN must_start := true; END IF;
            END IF;
          END IF;

          IF must_start THEN
            IF v_use_estab THEN
              SELECT valor_num, unidade INTO v_cur_val, v_cur_unid FROM public.tags_live
                WHERE owner_id = op_rec.owner_id AND nome = ati.qtd_tag_nome;
              INSERT INTO public.ordem_etapas(
                owner_id, ordem_id, processo_id, processo_nome, ordem_processo,
                atividade_id, atividade_descricao, tipo, ordem_atividade, iniciado_em,
                observacao, unidade, estab_fase, estab_amostras, estab_estavel_desde
              ) VALUES (
                op_rec.owner_id, op_rec.id, proc_rec.id, proc_rec.nome, COALESCE(proc_rec.ordem,0),
                ati.id, ati.descricao, ati.tipo, COALESCE(ati.ordem,0), v_now,
                '[auto: aguardando variação da tag]', COALESCE(v_cur_unid, ati.unidade),
                'aguardando_atividade',
                CASE WHEN v_cur_val IS NULL THEN '[]'::jsonb
                     ELSE jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur_val)) END,
                v_now);
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
                v_inicio, COALESCE(v_unid, ati.unidade));
              changes := changes + 1;
            END IF;
          END IF;
          CONTINUE;
        END IF;

        IF etapa_aberta.finalizado_em IS NOT NULL THEN CONTINUE; END IF;

        IF v_use_estab THEN
          SELECT valor_num INTO v_cur_val FROM public.tags_live
            WHERE owner_id = op_rec.owner_id AND nome = ati.qtd_tag_nome;
          IF v_cur_val IS NULL THEN CONTINUE; END IF;

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
              v_inicio := (SELECT (item->>'v')::numeric FROM jsonb_array_elements(v_amostras) item
                           ORDER BY (item->>'t')::timestamptz ASC LIMIT 1);
              UPDATE public.ordem_etapas
              SET valor_inicio = v_inicio,
                  estab_fase = 'consumindo',
                  estab_amostras = jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur_val)),
                  estab_estavel_desde = v_now
              WHERE id = etapa_aberta.id;
              changes := changes + 1;
            ELSE
              UPDATE public.ordem_etapas SET estab_amostras = v_amostras WHERE id = etapa_aberta.id;
            END IF;
            CONTINUE;
          END IF;

          IF etapa_aberta.estab_fase = 'consumindo' THEN
            IF v_var_pct <= ati.estab_pct THEN
              IF etapa_aberta.estab_estavel_desde IS NULL THEN
                UPDATE public.ordem_etapas SET estab_amostras = v_amostras, estab_estavel_desde = v_now
                WHERE id = etapa_aberta.id;
              ELSIF v_now - etapa_aberta.estab_estavel_desde >= make_interval(secs => GREATEST(COALESCE(ati.estab_min_estavel_seg,30),5)) THEN
                v_fim := v_cur_val;
                v_qtd := CASE WHEN etapa_aberta.valor_inicio IS NOT NULL THEN v_fim - etapa_aberta.valor_inicio ELSE NULL END;
                UPDATE public.ordem_etapas
                SET finalizado_em = v_now,
                    duracao_seg = GREATEST(EXTRACT(EPOCH FROM (v_now - iniciado_em))::int, 0),
                    valor_fim = v_fim, valor_capturado = v_qtd,
                    observacao = COALESCE(NULLIF(observacao,''),'') || ' · [estab: encerrado]'
                WHERE id = etapa_aberta.id;
                changes := changes + 1;
              ELSE
                UPDATE public.ordem_etapas SET estab_amostras = v_amostras WHERE id = etapa_aberta.id;
              END IF;
            ELSE
              UPDATE public.ordem_etapas SET estab_amostras = v_amostras, estab_estavel_desde = NULL
              WHERE id = etapa_aberta.id;
            END IF;
            CONTINUE;
          END IF;
        END IF;

        must_end := false; end_reason := NULL;

        IF ati.tipo = 'tag_captura' AND ati.captura_modo = 'gatilho_valor'
           AND ati.captura_gatilho IS NOT NULL AND ati.tag_nome IS NOT NULL THEN
          SELECT valor_num INTO tag_val FROM public.tags_live
            WHERE owner_id = op_rec.owner_id AND nome = ati.tag_nome;
          IF public._gatilho_match(tag_val, ati.captura_gatilho->>'operador',
              NULLIF(ati.captura_gatilho->>'valor','')::numeric) THEN
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
            IF ati.qtd_modo = 'tag_diferenca' THEN
              IF v_fim IS NOT NULL AND etapa_aberta.valor_inicio IS NOT NULL THEN
                v_qtd := v_fim - etapa_aberta.valor_inicio;
              END IF;
            ELSE v_qtd := v_fim; END IF;
          END IF;
          IF ati.tipo = 'tag_captura' AND ati.tag_nome IS NOT NULL THEN
            SELECT valor_num INTO v_cap FROM public.tags_live
              WHERE owner_id = op_rec.owner_id AND nome = ati.tag_nome;
          END IF;
          UPDATE public.ordem_etapas
          SET finalizado_em = v_now,
              duracao_seg = GREATEST(EXTRACT(EPOCH FROM (v_now - iniciado_em))::int, 0),
              valor_fim = COALESCE(v_fim, valor_fim),
              valor_capturado = COALESCE(v_cap, v_qtd, valor_capturado),
              observacao = COALESCE(NULLIF(observacao,''),'') || ' · [auto: '||end_reason||']'
          WHERE id = etapa_aberta.id;
          changes := changes + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN changes;
END;
$function$;

-- 5) Nova função: processa atividades por equipamento em paralelo
CREATE OR REPLACE FUNCTION public.auto_advance_equipamento_atividades()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  changes int := 0;
  op_rec RECORD;
  ati RECORD;
  etapa_aberta RECORD;
  trig jsonb;
  tag_val numeric;
  has_inicio_gat boolean;
  has_fim_gat boolean;
  must_start boolean;
  must_end boolean;
  end_reason text;
  v_inicio numeric;
  v_fim numeric;
  v_cap numeric;
  v_qtd numeric;
  v_unid text;
  v_use_estab boolean;
  v_cur_val numeric;
  v_cur_unid text;
  v_amostras jsonb;
  v_var_pct numeric;
  v_now timestamptz := now();
  v_cutoff timestamptz;
BEGIN
  FOR op_rec IN
    SELECT id, owner_id, equipamento_id
    FROM public.ordens_producao
    WHERE status = 'em_andamento' AND equipamento_id IS NOT NULL
  LOOP
    IF NOT public._equip_tem_atividades(op_rec.owner_id, op_rec.equipamento_id) THEN
      CONTINUE;
    END IF;

    FOR ati IN
      SELECT * FROM public.equipamento_atividades
      WHERE equipamento_id = op_rec.equipamento_id
        AND owner_id = op_rec.owner_id
        AND ativo = true
      ORDER BY COALESCE(ordem,0), created_at
    LOOP
      has_inicio_gat := false; has_fim_gat := false;
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
      WHERE ordem_id = op_rec.id AND equipamento_atividade_id = ati.id
      ORDER BY iniciado_em DESC LIMIT 1;

      -- Sem etapa aberta → decidir se inicia
      IF etapa_aberta.id IS NULL OR etapa_aberta.finalizado_em IS NOT NULL THEN
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
          -- Sem gatilho de início: inicia junto com a ordem (uma única vez)
          IF etapa_aberta.id IS NULL THEN must_start := true; END IF;
        END IF;

        IF must_start THEN
          IF v_use_estab THEN
            SELECT valor_num, unidade INTO v_cur_val, v_cur_unid FROM public.tags_live
              WHERE owner_id = op_rec.owner_id AND nome = ati.qtd_tag_nome;
            INSERT INTO public.ordem_etapas(
              owner_id, ordem_id, processo_nome, ordem_processo,
              equipamento_atividade_id, atividade_descricao, tipo, ordem_atividade, iniciado_em,
              observacao, unidade, estab_fase, estab_amostras, estab_estavel_desde
            ) VALUES (
              op_rec.owner_id, op_rec.id, ati.nome, COALESCE(ati.ordem,0),
              ati.id, COALESCE(ati.descricao, ati.nome), ati.tipo, COALESCE(ati.ordem,0), v_now,
              '[equip: aguardando variação]', COALESCE(v_cur_unid, ati.unidade),
              'aguardando_atividade',
              CASE WHEN v_cur_val IS NULL THEN '[]'::jsonb
                   ELSE jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur_val)) END,
              v_now);
            changes := changes + 1;
          ELSE
            v_inicio := NULL; v_unid := NULL;
            IF ati.tipo = 'materia_prima' AND ati.qtd_modo = 'tag_diferenca' AND ati.qtd_tag_nome IS NOT NULL THEN
              SELECT valor_num, unidade INTO v_inicio, v_unid FROM public.tags_live
                WHERE owner_id = op_rec.owner_id AND nome = ati.qtd_tag_nome;
            END IF;
            INSERT INTO public.ordem_etapas(
              owner_id, ordem_id, processo_nome, ordem_processo,
              equipamento_atividade_id, atividade_descricao, tipo, ordem_atividade, iniciado_em,
              observacao, valor_inicio, unidade
            ) VALUES (
              op_rec.owner_id, op_rec.id, ati.nome, COALESCE(ati.ordem,0),
              ati.id, COALESCE(ati.descricao, ati.nome), ati.tipo, COALESCE(ati.ordem,0), v_now,
              CASE WHEN has_inicio_gat THEN '[equip: gatilho]' ELSE '[equip: auto]' END,
              v_inicio, COALESCE(v_unid, ati.unidade));
            changes := changes + 1;
          END IF;
        END IF;
        CONTINUE;
      END IF;

      -- Etapa aberta em fase de estabilização
      IF v_use_estab THEN
        SELECT valor_num INTO v_cur_val FROM public.tags_live
          WHERE owner_id = op_rec.owner_id AND nome = ati.qtd_tag_nome;
        IF v_cur_val IS NULL THEN CONTINUE; END IF;
        v_cutoff := v_now - make_interval(secs => GREATEST(COALESCE(ati.estab_janela_seg,30),5));
        SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'t')::timestamptz), '[]'::jsonb)
          INTO v_amostras
          FROM jsonb_array_elements(COALESCE(etapa_aberta.estab_amostras,'[]'::jsonb)) item
          WHERE (item->>'t')::timestamptz >= v_cutoff;
        v_amostras := COALESCE(v_amostras,'[]'::jsonb)
                      || jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur_val));
        v_var_pct := public._estab_variacao_pct(v_amostras);

        IF COALESCE(etapa_aberta.estab_fase, 'aguardando_atividade') = 'aguardando_atividade' THEN
          IF v_var_pct > ati.estab_pct THEN
            v_inicio := (SELECT (item->>'v')::numeric FROM jsonb_array_elements(v_amostras) item
                         ORDER BY (item->>'t')::timestamptz ASC LIMIT 1);
            UPDATE public.ordem_etapas
            SET valor_inicio = v_inicio, estab_fase = 'consumindo',
                estab_amostras = jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur_val)),
                estab_estavel_desde = v_now
            WHERE id = etapa_aberta.id;
            changes := changes + 1;
          ELSE
            UPDATE public.ordem_etapas SET estab_amostras = v_amostras WHERE id = etapa_aberta.id;
          END IF;
          CONTINUE;
        END IF;

        IF etapa_aberta.estab_fase = 'consumindo' THEN
          IF v_var_pct <= ati.estab_pct THEN
            IF etapa_aberta.estab_estavel_desde IS NULL THEN
              UPDATE public.ordem_etapas SET estab_amostras = v_amostras, estab_estavel_desde = v_now
              WHERE id = etapa_aberta.id;
            ELSIF v_now - etapa_aberta.estab_estavel_desde >= make_interval(secs => GREATEST(COALESCE(ati.estab_min_estavel_seg,30),5)) THEN
              v_fim := v_cur_val;
              v_qtd := CASE WHEN etapa_aberta.valor_inicio IS NOT NULL THEN v_fim - etapa_aberta.valor_inicio ELSE NULL END;
              UPDATE public.ordem_etapas
              SET finalizado_em = v_now,
                  duracao_seg = GREATEST(EXTRACT(EPOCH FROM (v_now - iniciado_em))::int, 0),
                  valor_fim = v_fim, valor_capturado = v_qtd,
                  observacao = COALESCE(NULLIF(observacao,''),'') || ' · [equip estab: encerrado]'
              WHERE id = etapa_aberta.id;
              changes := changes + 1;
            ELSE
              UPDATE public.ordem_etapas SET estab_amostras = v_amostras WHERE id = etapa_aberta.id;
            END IF;
          ELSE
            UPDATE public.ordem_etapas SET estab_amostras = v_amostras, estab_estavel_desde = NULL
            WHERE id = etapa_aberta.id;
          END IF;
          CONTINUE;
        END IF;
      END IF;

      -- Encerramento por gatilho/tempo/captura
      must_end := false; end_reason := NULL;

      IF ati.tipo = 'tag_captura' AND ati.captura_modo = 'gatilho_valor'
         AND ati.captura_gatilho IS NOT NULL AND ati.tag_nome IS NOT NULL THEN
        SELECT valor_num INTO tag_val FROM public.tags_live
          WHERE owner_id = op_rec.owner_id AND nome = ati.tag_nome;
        IF public._gatilho_match(tag_val, ati.captura_gatilho->>'operador',
            NULLIF(ati.captura_gatilho->>'valor','')::numeric) THEN
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
          IF ati.qtd_modo = 'tag_diferenca' THEN
            IF v_fim IS NOT NULL AND etapa_aberta.valor_inicio IS NOT NULL THEN
              v_qtd := v_fim - etapa_aberta.valor_inicio;
            END IF;
          ELSE v_qtd := v_fim; END IF;
        END IF;
        IF ati.tipo = 'tag_captura' AND ati.tag_nome IS NOT NULL THEN
          SELECT valor_num INTO v_cap FROM public.tags_live
            WHERE owner_id = op_rec.owner_id AND nome = ati.tag_nome;
        END IF;
        UPDATE public.ordem_etapas
        SET finalizado_em = v_now,
            duracao_seg = GREATEST(EXTRACT(EPOCH FROM (v_now - iniciado_em))::int, 0),
            valor_fim = COALESCE(v_fim, valor_fim),
            valor_capturado = COALESCE(v_cap, v_qtd, valor_capturado),
            observacao = COALESCE(NULLIF(observacao,''),'') || ' · [equip auto: '||end_reason||']'
        WHERE id = etapa_aberta.id;
        changes := changes + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN changes;
END;
$function$;

-- 6) Cron a cada 10s para a nova função
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'auto_advance_equipamento_atividades_10s';
    PERFORM cron.schedule(
      'auto_advance_equipamento_atividades_10s',
      '10 seconds',
      $cron$SELECT public.auto_advance_equipamento_atividades();$cron$
    );
  END IF;
END $$;
