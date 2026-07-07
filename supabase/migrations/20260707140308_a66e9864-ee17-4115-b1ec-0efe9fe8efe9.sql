
-- 1) Trocar FK de alertas.processo_id: produto_processos -> equipamento_atividades
ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_processo_id_fkey;
ALTER TABLE public.alertas
  ADD CONSTRAINT alertas_processo_id_fkey
  FOREIGN KEY (processo_id) REFERENCES public.equipamento_atividades(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.alertas.processo_id IS
  'Referencia public.equipamento_atividades(id) quando tipo = ''processo_evento''. Nome mantido por compatibilidade histórica.';

-- 2) Reescrever evaluate_processo_alertas para usar equipamento_atividade_id
CREATE OR REPLACE FUNCTION public.evaluate_processo_alertas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_evento TEXT;
  v_duracao_min NUMERIC;
  v_msg TEXT;
BEGIN
  -- Nova regra: dispara com base na atividade do equipamento
  IF NEW.equipamento_atividade_id IS NULL THEN
    RETURN NEW;
  END IF;

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
      AND processo_id = NEW.equipamento_atividade_id
      AND (last_fired_at IS NULL OR now() - last_fired_at >= make_interval(mins => GREATEST(cooldown_minutes, 0)))
  LOOP
    v_msg := NULL;

    IF r.evento_processo = 'entrou' AND v_evento = 'entrou' THEN
      v_msg := format('Atividade "%s" iniciada', NEW.processo_nome);

    ELSIF r.evento_processo = 'concluido' AND v_evento = 'concluido' THEN
      v_msg := format('Atividade "%s" concluída (duração %s min)',
        NEW.processo_nome, round(COALESCE(v_duracao_min, 0)::numeric, 1));

    ELSIF r.evento_processo = 'demorou' AND v_evento = 'concluido'
          AND r.tempo_limite_minutos IS NOT NULL
          AND v_duracao_min IS NOT NULL
          AND v_duracao_min > r.tempo_limite_minutos THEN
      v_msg := format('Atividade "%s" demorou %s min (limite %s min)',
        NEW.processo_nome, round(v_duracao_min::numeric, 1), r.tempo_limite_minutos);
    END IF;

    IF v_msg IS NOT NULL THEN
      INSERT INTO public.alertas_disparos(owner_id, alerta_id, alerta_nome, severidade, mensagem, contexto)
      VALUES (r.owner_id, r.id, r.nome, r.severidade, v_msg,
        jsonb_build_object(
          'equipamento_atividade_id', NEW.equipamento_atividade_id,
          'atividade', NEW.processo_nome,
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
$function$;

-- 3) Remover função obsoleta (não é chamada pelo app)
DROP FUNCTION IF EXISTS public.save_produto_processo(uuid, text, jsonb);

-- 4) Arquivar tabelas antigas (dados preservados)
COMMENT ON TABLE public.produto_processos IS
  'ARQUIVADA em 2026-07 — substituída por equipamento_atividades. Mantida apenas para preservar histórico.';
COMMENT ON TABLE public.produto_atividades IS
  'ARQUIVADA em 2026-07 — substituída por equipamento_atividades. Mantida apenas para preservar histórico (ordem_etapas ainda referencia via atividade_id).';
