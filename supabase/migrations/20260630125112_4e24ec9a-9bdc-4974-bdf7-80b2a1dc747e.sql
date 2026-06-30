
ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS trigger_fired_at timestamptz NOT NULL DEFAULT now();

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
BEGIN
  FOR f IN
    SELECT id, owner_id, nome, graph, trigger_config, requires_approval
    FROM public.automation_flows
    WHERE ativo = true
      AND owner_id = p_owner_id
      AND trigger_type = p_trigger_type
  LOOP
    matches := false;

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
    END IF;

    IF matches THEN
      INSERT INTO public.automation_runs(flow_id, owner_id, status, trigger_context, planned_actions, trigger_fired_at)
      VALUES (
        f.id,
        f.owner_id,
        CASE WHEN f.requires_approval THEN 'pending_approval' ELSE 'approved' END,
        p_context,
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
