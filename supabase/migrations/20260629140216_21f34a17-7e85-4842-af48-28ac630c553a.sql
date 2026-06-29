
-- Extend alertas with new rule kinds
ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS parametro_id UUID REFERENCES public.parametros_cadastro(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS analise_id UUID REFERENCES public.analises_cadastro(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS processo_id UUID REFERENCES public.produto_processos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS evento_processo TEXT,
  ADD COLUMN IF NOT EXISTS tempo_limite_minutos INT;

-- =====================================================
-- Parametros: dispara quando valor registrado sai dos limites do cadastro
-- =====================================================
CREATE OR REPLACE FUNCTION public.evaluate_parametro_alertas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  pc RECORD;
  v_min NUMERIC;
  v_max NUMERIC;
  v_msg TEXT;
  v_off BOOLEAN;
BEGIN
  SELECT nome, unidade, valor_min, valor_max INTO pc
  FROM public.parametros_cadastro WHERE id = NEW.parametro_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  FOR r IN
    SELECT * FROM public.alertas
    WHERE owner_id = NEW.owner_id
      AND ativo = true
      AND tipo = 'parametro_min_max'
      AND parametro_id = NEW.parametro_id
      AND (last_fired_at IS NULL OR now() - last_fired_at >= make_interval(mins => GREATEST(cooldown_minutes, 0)))
  LOOP
    v_off := false;
    v_min := pc.valor_min;
    v_max := pc.valor_max;
    IF v_min IS NOT NULL AND NEW.valor < v_min THEN
      v_off := true;
      v_msg := format('%s = %s %s (abaixo do mínimo %s)', pc.nome, NEW.valor, COALESCE(pc.unidade,''), v_min);
    ELSIF v_max IS NOT NULL AND NEW.valor > v_max THEN
      v_off := true;
      v_msg := format('%s = %s %s (acima do máximo %s)', pc.nome, NEW.valor, COALESCE(pc.unidade,''), v_max);
    END IF;
    IF v_off THEN
      INSERT INTO public.alertas_disparos(owner_id, alerta_id, alerta_nome, severidade, mensagem, contexto)
      VALUES (r.owner_id, r.id, r.nome, r.severidade, v_msg,
        jsonb_build_object('parametro_id', NEW.parametro_id, 'parametro', pc.nome,
          'valor', NEW.valor, 'unidade', pc.unidade, 'min', v_min, 'max', v_max,
          'ordem_id', NEW.ordem_id));
      UPDATE public.alertas SET last_fired_at = now() WHERE id = r.id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parametros_alertas ON public.parametros_registrados;
CREATE TRIGGER trg_parametros_alertas
AFTER INSERT OR UPDATE ON public.parametros_registrados
FOR EACH ROW EXECUTE FUNCTION public.evaluate_parametro_alertas();

-- =====================================================
-- Analises: dispara quando resultado sai dos limites do cadastro
-- =====================================================
CREATE OR REPLACE FUNCTION public.evaluate_analise_alertas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  ac RECORD;
  v_min NUMERIC;
  v_max NUMERIC;
  v_msg TEXT;
  v_off BOOLEAN;
BEGIN
  SELECT nome, unidade, valor_min, valor_max INTO ac
  FROM public.analises_cadastro WHERE id = NEW.analise_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  FOR r IN
    SELECT * FROM public.alertas
    WHERE owner_id = NEW.owner_id
      AND ativo = true
      AND tipo = 'analise_min_max'
      AND analise_id = NEW.analise_id
      AND (last_fired_at IS NULL OR now() - last_fired_at >= make_interval(mins => GREATEST(cooldown_minutes, 0)))
  LOOP
    v_off := false;
    v_min := ac.valor_min;
    v_max := ac.valor_max;
    IF v_min IS NOT NULL AND NEW.resultado < v_min THEN
      v_off := true;
      v_msg := format('%s = %s %s (abaixo do mínimo %s)', ac.nome, NEW.resultado, COALESCE(ac.unidade,''), v_min);
    ELSIF v_max IS NOT NULL AND NEW.resultado > v_max THEN
      v_off := true;
      v_msg := format('%s = %s %s (acima do máximo %s)', ac.nome, NEW.resultado, COALESCE(ac.unidade,''), v_max);
    END IF;
    IF v_off THEN
      INSERT INTO public.alertas_disparos(owner_id, alerta_id, alerta_nome, severidade, mensagem, contexto)
      VALUES (r.owner_id, r.id, r.nome, r.severidade, v_msg,
        jsonb_build_object('analise_id', NEW.analise_id, 'analise', ac.nome,
          'resultado', NEW.resultado, 'unidade', ac.unidade, 'min', v_min, 'max', v_max,
          'ordem_id', NEW.ordem_id));
      UPDATE public.alertas SET last_fired_at = now() WHERE id = r.id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_analises_alertas ON public.analises_registradas;
CREATE TRIGGER trg_analises_alertas
AFTER INSERT OR UPDATE ON public.analises_registradas
FOR EACH ROW EXECUTE FUNCTION public.evaluate_analise_alertas();

-- =====================================================
-- Processos: entrou / concluido / demorou / atividade_faltante
-- =====================================================
CREATE OR REPLACE FUNCTION public.evaluate_processo_alertas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_evento TEXT;
  v_duracao_min NUMERIC;
  v_msg TEXT;
  v_faltantes INT;
  v_faltantes_list TEXT;
BEGIN
  IF NEW.processo_id IS NULL THEN RETURN NEW; END IF;

  -- Determine which event(s) this row represents
  IF TG_OP = 'INSERT' THEN
    v_evento := 'entrou';
  ELSIF TG_OP = 'UPDATE' AND OLD.finalizado_em IS NULL AND NEW.finalizado_em IS NOT NULL THEN
    v_evento := 'concluido';
  ELSE
    RETURN NEW;
  END IF;

  v_duracao_min := CASE
    WHEN NEW.finalizado_em IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NEW.finalizado_em - NEW.iniciado_em)) / 60.0
    ELSE NULL
  END;

  FOR r IN
    SELECT * FROM public.alertas
    WHERE owner_id = NEW.owner_id
      AND ativo = true
      AND tipo = 'processo_evento'
      AND processo_id = NEW.processo_id
      AND (last_fired_at IS NULL OR now() - last_fired_at >= make_interval(mins => GREATEST(cooldown_minutes, 0)))
  LOOP
    v_msg := NULL;

    IF r.evento_processo = 'entrou' AND v_evento = 'entrou' THEN
      v_msg := format('Ordem entrou no processo "%s"', NEW.processo_nome);

    ELSIF r.evento_processo = 'concluido' AND v_evento = 'concluido' THEN
      v_msg := format('Processo "%s" concluído (duração %s min)', NEW.processo_nome,
        round(COALESCE(v_duracao_min, 0)::numeric, 1));

    ELSIF r.evento_processo = 'demorou' AND v_evento = 'concluido'
          AND r.tempo_limite_minutos IS NOT NULL
          AND v_duracao_min IS NOT NULL
          AND v_duracao_min > r.tempo_limite_minutos THEN
      v_msg := format('Processo "%s" demorou %s min (limite %s min)',
        NEW.processo_nome, round(v_duracao_min::numeric, 1), r.tempo_limite_minutos);

    ELSIF r.evento_processo = 'atividade_faltante' AND v_evento = 'concluido' THEN
      SELECT COUNT(*), string_agg(pa.descricao, ', ')
        INTO v_faltantes, v_faltantes_list
      FROM public.produto_atividades pa
      WHERE pa.processo_id = NEW.processo_id
        AND NOT EXISTS (
          SELECT 1 FROM public.ordem_etapas oe
          WHERE oe.ordem_id = NEW.ordem_id
            AND oe.atividade_id = pa.id
        );
      IF COALESCE(v_faltantes, 0) > 0 THEN
        v_msg := format('Processo "%s" concluído sem registrar %s atividade(s): %s',
          NEW.processo_nome, v_faltantes, v_faltantes_list);
      END IF;
    END IF;

    IF v_msg IS NOT NULL THEN
      INSERT INTO public.alertas_disparos(owner_id, alerta_id, alerta_nome, severidade, mensagem, contexto)
      VALUES (r.owner_id, r.id, r.nome, r.severidade, v_msg,
        jsonb_build_object(
          'processo_id', NEW.processo_id,
          'processo', NEW.processo_nome,
          'ordem_id', NEW.ordem_id,
          'evento', r.evento_processo,
          'duracao_min', v_duracao_min,
          'tempo_limite_minutos', r.tempo_limite_minutos
        ));
      UPDATE public.alertas SET last_fired_at = now() WHERE id = r.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ordem_etapas_alertas ON public.ordem_etapas;
CREATE TRIGGER trg_ordem_etapas_alertas
AFTER INSERT OR UPDATE ON public.ordem_etapas
FOR EACH ROW EXECUTE FUNCTION public.evaluate_processo_alertas();

-- Revoke EXECUTE from anon/public on new SECURITY DEFINER fns
REVOKE EXECUTE ON FUNCTION public.evaluate_parametro_alertas() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_analise_alertas() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_processo_alertas() FROM PUBLIC, anon;

CREATE INDEX IF NOT EXISTS idx_alertas_parametro ON public.alertas(owner_id, parametro_id) WHERE tipo = 'parametro_min_max';
CREATE INDEX IF NOT EXISTS idx_alertas_analise ON public.alertas(owner_id, analise_id) WHERE tipo = 'analise_min_max';
CREATE INDEX IF NOT EXISTS idx_alertas_processo ON public.alertas(owner_id, processo_id) WHERE tipo = 'processo_evento';
