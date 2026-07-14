
-- =========================================================
-- Gestão de paradas de equipamentos (fundação)
-- =========================================================

-- 1) Novas colunas em equipamentos (todas opcionais / com default)
ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS parada_tag_nome text,
  ADD COLUMN IF NOT EXISTS parada_modo text,          -- 'valor' | 'faixa' | 'velocidade_zero'
  ADD COLUMN IF NOT EXISTS parada_operador text,       -- '=', '<', '>', '<=', '>='
  ADD COLUMN IF NOT EXISTS parada_valor numeric,
  ADD COLUMN IF NOT EXISTS parada_valor_min numeric,
  ADD COLUMN IF NOT EXISTS parada_valor_max numeric,
  ADD COLUMN IF NOT EXISTS parada_tempo_min_seg integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS parada_alerta_apos_min integer,
  ADD COLUMN IF NOT EXISTS parada_motivos text[] DEFAULT ARRAY[
    'Falta de energia',
    'Parada programada',
    'Parada não programada',
    'Manutenção',
    'Setup / Troca de produto',
    'Falta de matéria-prima',
    'Falha operacional',
    'Outro'
  ]::text[],
  ADD COLUMN IF NOT EXISTS parada_pending_since timestamptz,
  ADD COLUMN IF NOT EXISTS parada_last_state text;    -- 'parado' | 'operando'

-- 2) Tabela de paradas
CREATE TABLE IF NOT EXISTS public.paradas_equipamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  equipamento_id uuid NOT NULL REFERENCES public.equipamentos(id) ON DELETE CASCADE,
  ordem_producao_id uuid REFERENCES public.ordens_producao(id) ON DELETE SET NULL,
  inicio_em timestamptz NOT NULL DEFAULT now(),
  fim_em timestamptz,
  duracao_seg integer,
  tag_nome text,
  tag_valor_inicio numeric,
  tag_valor_fim numeric,
  motivo text,
  categoria text,
  observacao text,
  status text NOT NULL DEFAULT 'em_andamento',  -- 'em_andamento' | 'aguardando_motivo' | 'registrada'
  alerta_disparado boolean NOT NULL DEFAULT false,
  registrado_por uuid,
  registrado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paradas_equipamento_owner_idx ON public.paradas_equipamento(owner_id);
CREATE INDEX IF NOT EXISTS paradas_equipamento_equip_idx ON public.paradas_equipamento(equipamento_id);
CREATE INDEX IF NOT EXISTS paradas_equipamento_status_idx ON public.paradas_equipamento(status);
CREATE INDEX IF NOT EXISTS paradas_equipamento_inicio_idx ON public.paradas_equipamento(inicio_em DESC);
-- Só uma parada aberta por equipamento
CREATE UNIQUE INDEX IF NOT EXISTS paradas_equipamento_open_unique
  ON public.paradas_equipamento(equipamento_id)
  WHERE status = 'em_andamento';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paradas_equipamento TO authenticated;
GRANT ALL ON public.paradas_equipamento TO service_role;

ALTER TABLE public.paradas_equipamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paradas visíveis por owner"
  ON public.paradas_equipamento FOR SELECT
  USING (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY "paradas inserção por owner"
  ON public.paradas_equipamento FOR INSERT
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY "paradas update por owner"
  ON public.paradas_equipamento FOR UPDATE
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY "paradas delete admin/gerente"
  ON public.paradas_equipamento FOR DELETE
  USING (public.can_manage_users(auth.uid()));

CREATE TRIGGER paradas_equipamento_set_updated_at
  BEFORE UPDATE ON public.paradas_equipamento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Função auxiliar: avalia se está em condição de "parado"
CREATE OR REPLACE FUNCTION public._parada_condicao(
  p_valor numeric,
  p_modo text,
  p_operador text,
  p_valor_ref numeric,
  p_min numeric,
  p_max numeric
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_valor IS NULL THEN NULL
    WHEN p_modo = 'valor' THEN CASE p_operador
        WHEN '='  THEN p_valor =  p_valor_ref
        WHEN '<'  THEN p_valor <  p_valor_ref
        WHEN '>'  THEN p_valor >  p_valor_ref
        WHEN '<=' THEN p_valor <= p_valor_ref
        WHEN '>=' THEN p_valor >= p_valor_ref
        ELSE NULL END
    WHEN p_modo = 'faixa' THEN
      (p_min IS NOT NULL AND p_valor < p_min) OR (p_max IS NOT NULL AND p_valor > p_max)
    WHEN p_modo = 'velocidade_zero' THEN
      p_valor <= COALESCE(p_valor_ref, 0)
    ELSE NULL
  END;
$$;

-- 4) Trigger em tags_live: cria/fecha paradas
CREATE OR REPLACE FUNCTION public.tags_live_paradas_evaluate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eq record;
  is_parado boolean;
  v_ordem_id uuid;
  v_min_seg int;
  v_open record;
BEGIN
  IF NEW.valor_num IS NULL THEN RETURN NEW; END IF;

  FOR eq IN
    SELECT id, owner_id, parada_modo, parada_operador, parada_valor,
           parada_valor_min, parada_valor_max, parada_tempo_min_seg,
           parada_pending_since, parada_last_state
    FROM public.equipamentos
    WHERE owner_id = NEW.owner_id
      AND ativo = true
      AND parada_tag_nome = NEW.nome
      AND parada_modo IS NOT NULL
  LOOP
    is_parado := public._parada_condicao(
      NEW.valor_num, eq.parada_modo, eq.parada_operador,
      eq.parada_valor, eq.parada_valor_min, eq.parada_valor_max
    );
    IF is_parado IS NULL THEN CONTINUE; END IF;

    v_min_seg := GREATEST(COALESCE(eq.parada_tempo_min_seg, 15), 0);

    IF is_parado THEN
      -- Se já existe parada aberta, apenas segue
      IF EXISTS (SELECT 1 FROM public.paradas_equipamento
                 WHERE equipamento_id = eq.id AND status = 'em_andamento') THEN
        UPDATE public.equipamentos SET parada_last_state = 'parado' WHERE id = eq.id;
        CONTINUE;
      END IF;

      -- Debounce
      IF eq.parada_pending_since IS NULL THEN
        UPDATE public.equipamentos
          SET parada_pending_since = now(), parada_last_state = 'operando'
          WHERE id = eq.id;
        CONTINUE;
      END IF;

      IF now() - eq.parada_pending_since < make_interval(secs => v_min_seg) THEN
        CONTINUE;
      END IF;

      -- Abre parada
      SELECT id INTO v_ordem_id FROM public.ordens_producao
        WHERE equipamento_id = eq.id AND status = 'em_andamento'
        ORDER BY updated_at DESC LIMIT 1;

      INSERT INTO public.paradas_equipamento(
        owner_id, equipamento_id, ordem_producao_id, inicio_em,
        tag_nome, tag_valor_inicio, status
      ) VALUES (
        eq.owner_id, eq.id, v_ordem_id, COALESCE(eq.parada_pending_since, now()),
        NEW.nome, NEW.valor_num, 'em_andamento'
      );

      UPDATE public.equipamentos
        SET parada_pending_since = NULL, parada_last_state = 'parado'
        WHERE id = eq.id;

    ELSE
      -- Voltou a operar: cancela pending e fecha parada aberta
      IF eq.parada_pending_since IS NOT NULL THEN
        UPDATE public.equipamentos SET parada_pending_since = NULL WHERE id = eq.id;
      END IF;

      SELECT * INTO v_open FROM public.paradas_equipamento
        WHERE equipamento_id = eq.id AND status = 'em_andamento'
        LIMIT 1;
      IF FOUND THEN
        UPDATE public.paradas_equipamento
          SET fim_em = now(),
              duracao_seg = GREATEST(EXTRACT(EPOCH FROM (now() - v_open.inicio_em))::int, 0),
              tag_valor_fim = NEW.valor_num,
              status = 'aguardando_motivo'
          WHERE id = v_open.id;
      END IF;

      UPDATE public.equipamentos SET parada_last_state = 'operando' WHERE id = eq.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tags_live_paradas_trigger ON public.tags_live;
CREATE TRIGGER tags_live_paradas_trigger
  AFTER INSERT OR UPDATE OF valor_num ON public.tags_live
  FOR EACH ROW EXECUTE FUNCTION public.tags_live_paradas_evaluate();

-- 5) Dispatcher de alertas de parada prolongada (chamado por cron)
CREATE OR REPLACE FUNCTION public.dispatch_paradas_alertas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  eq record;
  fired int := 0;
  v_min_since numeric;
BEGIN
  FOR r IN
    SELECT p.*, e.nome AS equip_nome, e.codigo AS equip_codigo,
           e.parada_alerta_apos_min AS alerta_apos
    FROM public.paradas_equipamento p
    JOIN public.equipamentos e ON e.id = p.equipamento_id
    WHERE p.status = 'em_andamento'
      AND p.alerta_disparado = false
      AND e.parada_alerta_apos_min IS NOT NULL
      AND e.parada_alerta_apos_min > 0
  LOOP
    v_min_since := EXTRACT(EPOCH FROM (now() - r.inicio_em)) / 60.0;
    IF v_min_since >= r.alerta_apos THEN
      INSERT INTO public.alertas_disparos(
        owner_id, alerta_nome, severidade, mensagem, categoria, status, contexto
      ) VALUES (
        r.owner_id,
        format('Parada prolongada — %s', COALESCE(r.equip_nome, r.equip_codigo, 'equipamento')),
        'warn',
        format('Equipamento %s está parado há %s min. Verificar motivo.',
               COALESCE(r.equip_nome, r.equip_codigo, ''), round(v_min_since)::text),
        'alerta', 'novo',
        jsonb_build_object(
          'parada_id', r.id,
          'equipamento_id', r.equipamento_id,
          'inicio_em', r.inicio_em,
          'duracao_min', round(v_min_since, 1)
        )
      );
      UPDATE public.paradas_equipamento SET alerta_disparado = true WHERE id = r.id;
      fired := fired + 1;
    END IF;
  END LOOP;

  RETURN fired;
END;
$$;

-- 6) Cron: verifica a cada minuto
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-paradas-alertas') THEN
    PERFORM cron.unschedule('dispatch-paradas-alertas');
  END IF;
  PERFORM cron.schedule(
    'dispatch-paradas-alertas',
    '* * * * *',
    $cron$SELECT public.dispatch_paradas_alertas();$cron$
  );
END $$;
