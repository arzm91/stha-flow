-- ============================================================
-- AUTOMATION FLOWS
-- ============================================================
CREATE TABLE public.automation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  trigger_type text,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_approval boolean NOT NULL DEFAULT true,
  notify_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_flows TO authenticated;
GRANT ALL ON public.automation_flows TO service_role;

ALTER TABLE public.automation_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own flows"
  ON public.automation_flows FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_automation_flows_updated_at
  BEFORE UPDATE ON public.automation_flows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_automation_flows_owner ON public.automation_flows(owner_id);
CREATE INDEX idx_automation_flows_ativo ON public.automation_flows(ativo) WHERE ativo = true;
CREATE INDEX idx_automation_flows_trigger_type ON public.automation_flows(trigger_type) WHERE ativo = true;

-- ============================================================
-- AUTOMATION RUNS (execuções)
-- ============================================================
CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_approval',
  trigger_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  planned_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb,
  error_message text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_chk CHECK (status IN ('pending_approval','approved','rejected','executing','completed','failed','snoozed','auto_executed'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own runs"
  ON public.automation_runs FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_automation_runs_updated_at
  BEFORE UPDATE ON public.automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_automation_runs_owner_status ON public.automation_runs(owner_id, status);
CREATE INDEX idx_automation_runs_flow ON public.automation_runs(flow_id);
CREATE INDEX idx_automation_runs_pending ON public.automation_runs(owner_id, created_at DESC) WHERE status = 'pending_approval';

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_runs;

-- ============================================================
-- DISPATCH FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispatch_automation_trigger(
  p_owner_id uuid,
  p_trigger_type text,
  p_context jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f record;
  fired int := 0;
  tag_name text;
  threshold_min numeric;
  threshold_max numeric;
  current_val numeric;
  matches boolean;
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
        threshold_min := NULLIF(f.trigger_config->>'min','')::numeric;
        threshold_max := NULLIF(f.trigger_config->>'max','')::numeric;
        IF current_val IS NOT NULL AND (
          (threshold_min IS NOT NULL AND current_val < threshold_min) OR
          (threshold_max IS NOT NULL AND current_val > threshold_max)
        ) THEN
          matches := true;
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
      INSERT INTO public.automation_runs(flow_id, owner_id, status, trigger_context, planned_actions)
      VALUES (
        f.id,
        f.owner_id,
        CASE WHEN f.requires_approval THEN 'pending_approval' ELSE 'approved' END,
        p_context,
        COALESCE(f.graph->'nodes', '[]'::jsonb)
      );
      UPDATE public.automation_flows SET last_triggered_at = now() WHERE id = f.id;
      fired := fired + 1;
    END IF;
  END LOOP;
  RETURN fired;
END;
$$;

-- ============================================================
-- TAG VALUE TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.tags_live_automation_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tags_live_automation
  AFTER INSERT OR UPDATE OF valor_num ON public.tags_live
  FOR EACH ROW EXECUTE FUNCTION public.tags_live_automation_trigger();

-- ============================================================
-- PRODUCTION EVENT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.ordens_producao_automation_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  evt text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    evt := 'ordem_criada';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    evt := 'ordem_status_' || NEW.status;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.dispatch_automation_trigger(
    NEW.owner_id,
    'production_event',
    jsonb_build_object(
      'evento', evt,
      'ordem_id', NEW.id,
      'status', NEW.status
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ordens_producao_automation
  AFTER INSERT OR UPDATE ON public.ordens_producao
  FOR EACH ROW EXECUTE FUNCTION public.ordens_producao_automation_trigger();
