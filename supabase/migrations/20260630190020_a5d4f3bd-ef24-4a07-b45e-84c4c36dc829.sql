
-- 1) Estado de detecção/estabilização por fluxo de automação
CREATE TABLE IF NOT EXISTS public.automation_flow_estab_state (
  flow_id uuid PRIMARY KEY REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  tag_nome text NOT NULL,
  fase text NOT NULL DEFAULT 'aguardando',
  amostras jsonb NOT NULL DEFAULT '[]'::jsonb,
  valor_inicio numeric,
  estavel_desde timestamptz,
  ultimo_disparo_em timestamptz,
  ultimo_evento text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_flow_estab_state TO authenticated;
GRANT ALL ON public.automation_flow_estab_state TO service_role;

ALTER TABLE public.automation_flow_estab_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_estab_state_read" ON public.automation_flow_estab_state;
CREATE POLICY "own_estab_state_read" ON public.automation_flow_estab_state
  FOR SELECT TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()));

-- 2) Estender dispatch para tratar 'tag_stabilization'.
CREATE OR REPLACE FUNCTION public.dispatch_automation_trigger(p_owner_id uuid, p_trigger_type text, p_context jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  f record;
  fired int := 0;
  tag_name text;
  threshold_min numeric;
  threshold_max numeric;
  cmp_op text;
  cmp_val numeric;
  current_val numeric;
  matches boolean;
  v_now timestamptz := now();
  -- estabilização
  st record;
  cfg_tag text;
  cfg_pct numeric;
  cfg_janela int;
  cfg_min_estavel int;
  cfg_evento text;
  v_cur numeric;
  v_cutoff timestamptz;
  v_amostras jsonb;
  v_var_pct numeric;
  v_inicio numeric;
  v_fire_evento text;
BEGIN
  FOR f IN
    SELECT id, owner_id, nome, graph, trigger_config, requires_approval
    FROM public.automation_flows
    WHERE ativo = true
      AND owner_id = p_owner_id
      AND trigger_type = p_trigger_type
  LOOP
    matches := false;
    v_fire_evento := NULL;

    IF p_trigger_type = 'tag_value' THEN
      tag_name := f.trigger_config->>'tag_nome';
      IF tag_name IS NOT NULL AND p_context->>'tag_nome' = tag_name THEN
        current_val := NULLIF(p_context->>'valor_num','')::numeric;
        cmp_op := f.trigger_config->>'operador';
        cmp_val := NULLIF(f.trigger_config->>'valor','')::numeric;
        IF current_val IS NOT NULL AND cmp_op IS NOT NULL AND cmp_val IS NOT NULL THEN
          matches := CASE cmp_op
            WHEN 'gt'  THEN current_val >  cmp_val
            WHEN 'lt'  THEN current_val <  cmp_val
            WHEN 'gte' THEN current_val >= cmp_val
            WHEN 'lte' THEN current_val <= cmp_val
            WHEN 'eq'  THEN current_val =  cmp_val
            WHEN 'neq' THEN current_val <> cmp_val
            ELSE false
          END;
        ELSIF current_val IS NOT NULL THEN
          threshold_min := NULLIF(f.trigger_config->>'min','')::numeric;
          threshold_max := NULLIF(f.trigger_config->>'max','')::numeric;
          IF (threshold_min IS NOT NULL AND current_val < threshold_min) OR
             (threshold_max IS NOT NULL AND current_val > threshold_max) THEN
            matches := true;
          END IF;
        END IF;
      END IF;

    ELSIF p_trigger_type = 'production_event' THEN
      IF (f.trigger_config->>'evento') = (p_context->>'evento') THEN
        matches := true;
      END IF;

    ELSIF p_trigger_type = 'schedule' OR p_trigger_type = 'tag_stale' THEN
      matches := true;

    ELSIF p_trigger_type = 'tag_stabilization' THEN
      cfg_tag := f.trigger_config->>'tag_nome';
      IF cfg_tag IS NOT NULL AND p_context->>'tag_nome' = cfg_tag THEN
        cfg_pct         := COALESCE(NULLIF(f.trigger_config->>'pct','')::numeric, 2);
        cfg_janela      := COALESCE(NULLIF(f.trigger_config->>'janela_seg','')::int, 30);
        cfg_min_estavel := COALESCE(NULLIF(f.trigger_config->>'min_estavel_seg','')::int, 30);
        cfg_evento      := COALESCE(NULLIF(f.trigger_config->>'evento',''), 'estabilizou'); -- ou 'inicio_consumo'
        v_cur := NULLIF(p_context->>'valor_num','')::numeric;

        IF v_cur IS NOT NULL THEN
          -- carrega/cria estado
          SELECT * INTO st FROM public.automation_flow_estab_state WHERE flow_id = f.id;
          IF st.flow_id IS NULL THEN
            INSERT INTO public.automation_flow_estab_state(flow_id, owner_id, tag_nome, fase, amostras, atualizado_em)
            VALUES (f.id, f.owner_id, cfg_tag, 'aguardando',
                    jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur)), v_now);
            CONTINUE;
          END IF;

          v_cutoff := v_now - make_interval(secs => GREATEST(cfg_janela, 5));
          SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'t')::timestamptz), '[]'::jsonb)
            INTO v_amostras
            FROM jsonb_array_elements(COALESCE(st.amostras,'[]'::jsonb)) item
            WHERE (item->>'t')::timestamptz >= v_cutoff;
          v_amostras := COALESCE(v_amostras,'[]'::jsonb)
                        || jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur));
          v_var_pct := public._estab_variacao_pct(v_amostras);

          IF COALESCE(st.fase, 'aguardando') = 'aguardando' THEN
            IF v_var_pct > cfg_pct THEN
              v_inicio := (
                SELECT (item->>'v')::numeric
                FROM jsonb_array_elements(v_amostras) item
                ORDER BY (item->>'t')::timestamptz ASC LIMIT 1
              );
              UPDATE public.automation_flow_estab_state
              SET fase = 'consumindo',
                  amostras = jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur)),
                  valor_inicio = v_inicio,
                  estavel_desde = v_now,
                  atualizado_em = v_now
              WHERE flow_id = f.id;
              IF cfg_evento = 'inicio_consumo' THEN
                matches := true;
                v_fire_evento := 'inicio_consumo';
              END IF;
            ELSE
              UPDATE public.automation_flow_estab_state
              SET amostras = v_amostras, atualizado_em = v_now
              WHERE flow_id = f.id;
            END IF;

          ELSIF st.fase = 'consumindo' THEN
            IF v_var_pct <= cfg_pct THEN
              IF st.estavel_desde IS NULL THEN
                UPDATE public.automation_flow_estab_state
                SET amostras = v_amostras, estavel_desde = v_now, atualizado_em = v_now
                WHERE flow_id = f.id;
              ELSIF v_now - st.estavel_desde >= make_interval(secs => GREATEST(cfg_min_estavel, 5)) THEN
                UPDATE public.automation_flow_estab_state
                SET fase = 'aguardando',
                    amostras = jsonb_build_array(jsonb_build_object('t', v_now, 'v', v_cur)),
                    valor_inicio = NULL,
                    estavel_desde = NULL,
                    ultimo_disparo_em = v_now,
                    ultimo_evento = 'estabilizou',
                    atualizado_em = v_now
                WHERE flow_id = f.id;
                IF cfg_evento = 'estabilizou' THEN
                  matches := true;
                  v_fire_evento := 'estabilizou';
                END IF;
              ELSE
                UPDATE public.automation_flow_estab_state
                SET amostras = v_amostras, atualizado_em = v_now
                WHERE flow_id = f.id;
              END IF;
            ELSE
              UPDATE public.automation_flow_estab_state
              SET amostras = v_amostras, estavel_desde = NULL, atualizado_em = v_now
              WHERE flow_id = f.id;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    IF matches THEN
      INSERT INTO public.automation_runs(flow_id, owner_id, status, trigger_context, planned_actions, trigger_fired_at)
      VALUES (
        f.id,
        f.owner_id,
        CASE WHEN f.requires_approval THEN 'pending_approval' ELSE 'approved' END,
        p_context || jsonb_build_object('evento_estab', v_fire_evento),
        COALESCE(f.graph, jsonb_build_object('nodes', '[]'::jsonb, 'edges', '[]'::jsonb)),
        v_now
      );
      UPDATE public.automation_flows SET last_triggered_at = v_now WHERE id = f.id;
      fired := fired + 1;
    END IF;
  END LOOP;
  RETURN fired;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dispatch_automation_trigger(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_automation_trigger(uuid, text, jsonb) TO service_role;

-- 3) Adicionar dispatch de tag_stabilization no trigger de tags_live (mantém tag_value).
CREATE OR REPLACE FUNCTION public.tags_live_automation_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.valor_num IS NOT NULL THEN
    PERFORM public.dispatch_automation_trigger(
      NEW.owner_id,
      'tag_value',
      jsonb_build_object(
        'tag_nome', NEW.nome,
        'valor', NEW.valor,
        'valor_num', NEW.valor_num,
        'unidade', NEW.unidade,
        'atualizado_em', NEW.atualizado_em
      )
    );
    PERFORM public.dispatch_automation_trigger(
      NEW.owner_id,
      'tag_stabilization',
      jsonb_build_object(
        'tag_nome', NEW.nome,
        'valor', NEW.valor,
        'valor_num', NEW.valor_num,
        'unidade', NEW.unidade,
        'atualizado_em', NEW.atualizado_em
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;
