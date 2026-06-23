
-- =========================================================
-- ALERTAS: regras + disparos
-- =========================================================

CREATE TABLE public.alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'tag_min_max', -- tag_min_max | tag_stale | custom
  tag_nome TEXT,
  min_val NUMERIC,
  max_val NUMERIC,
  stale_minutes INT,
  severidade TEXT NOT NULL DEFAULT 'warn', -- info | warn | critical
  ativo BOOLEAN NOT NULL DEFAULT true,
  notificar_email BOOLEAN NOT NULL DEFAULT false,
  cooldown_minutes INT NOT NULL DEFAULT 5,
  last_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas TO authenticated;
GRANT ALL ON public.alertas TO service_role;

ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alertas"
  ON public.alertas FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER alertas_set_updated_at
  BEFORE UPDATE ON public.alertas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_alertas_owner_ativo ON public.alertas(owner_id, ativo);
CREATE INDEX idx_alertas_tag ON public.alertas(owner_id, tag_nome) WHERE tipo = 'tag_min_max';

-- ---------------------------------------------------------
CREATE TABLE public.alertas_disparos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alerta_id UUID REFERENCES public.alertas(id) ON DELETE SET NULL,
  alerta_nome TEXT NOT NULL,
  severidade TEXT NOT NULL DEFAULT 'warn',
  mensagem TEXT NOT NULL,
  contexto JSONB,
  status TEXT NOT NULL DEFAULT 'novo', -- novo | visto | resolvido
  resolvido_em TIMESTAMPTZ,
  resolvido_por UUID REFERENCES auth.users(id),
  resolucao_nota TEXT,
  email_enviado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas_disparos TO authenticated;
GRANT ALL ON public.alertas_disparos TO service_role;

ALTER TABLE public.alertas_disparos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own disparos"
  ON public.alertas_disparos FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER alertas_disparos_set_updated_at
  BEFORE UPDATE ON public.alertas_disparos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_disparos_owner_status ON public.alertas_disparos(owner_id, status, created_at DESC);

-- =========================================================
-- Função de avaliação de alertas por tag
-- =========================================================
CREATE OR REPLACE FUNCTION public.evaluate_tag_alertas(
  p_owner_id UUID,
  p_tag_nome TEXT,
  p_valor_num NUMERIC,
  p_valor TEXT,
  p_unidade TEXT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  fired INT := 0;
  v_msg TEXT;
  v_off BOOLEAN;
BEGIN
  IF p_valor_num IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT * FROM public.alertas
    WHERE owner_id = p_owner_id
      AND ativo = true
      AND tipo = 'tag_min_max'
      AND tag_nome = p_tag_nome
      AND (
        last_fired_at IS NULL
        OR now() - last_fired_at >= make_interval(mins => GREATEST(cooldown_minutes, 0))
      )
  LOOP
    v_off := false;
    v_msg := NULL;

    IF r.min_val IS NOT NULL AND p_valor_num < r.min_val THEN
      v_off := true;
      v_msg := format('%s = %s %s (abaixo do mínimo %s)',
        p_tag_nome, p_valor_num, COALESCE(p_unidade,''), r.min_val);
    ELSIF r.max_val IS NOT NULL AND p_valor_num > r.max_val THEN
      v_off := true;
      v_msg := format('%s = %s %s (acima do máximo %s)',
        p_tag_nome, p_valor_num, COALESCE(p_unidade,''), r.max_val);
    END IF;

    IF v_off THEN
      INSERT INTO public.alertas_disparos(
        owner_id, alerta_id, alerta_nome, severidade, mensagem, contexto
      ) VALUES (
        r.owner_id, r.id, r.nome, r.severidade, v_msg,
        jsonb_build_object(
          'tag_nome', p_tag_nome,
          'valor', p_valor,
          'valor_num', p_valor_num,
          'unidade', p_unidade,
          'min', r.min_val,
          'max', r.max_val
        )
      );
      UPDATE public.alertas SET last_fired_at = now() WHERE id = r.id;
      fired := fired + 1;
    END IF;
  END LOOP;

  RETURN fired;
END;
$$;

-- Trigger function on tags_live
CREATE OR REPLACE FUNCTION public.tags_live_alertas_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.valor_num IS NOT NULL THEN
    PERFORM public.evaluate_tag_alertas(
      NEW.owner_id, NEW.nome, NEW.valor_num, NEW.valor, NEW.unidade
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tags_live_alertas ON public.tags_live;
CREATE TRIGGER trg_tags_live_alertas
  AFTER INSERT OR UPDATE OF valor_num ON public.tags_live
  FOR EACH ROW EXECUTE FUNCTION public.tags_live_alertas_trigger();

-- =========================================================
-- Realtime
-- =========================================================
ALTER TABLE public.alertas REPLICA IDENTITY FULL;
ALTER TABLE public.alertas_disparos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas_disparos;
