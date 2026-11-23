ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS valor_ativacao numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tag_nivel_primario text,
  ADD COLUMN IF NOT EXISTS tag_nivel_secundario text,
  ADD COLUMN IF NOT EXISTS grupo_tag text;

CREATE INDEX IF NOT EXISTS idx_alertas_digital ON public.alertas(owner_id, tag_nome) WHERE tipo = 'tag_digital';

CREATE OR REPLACE FUNCTION public.evaluate_tag_digital(p_owner_id uuid, p_tag_nome text, p_valor_num numeric, p_prev numeric)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r RECORD; fired INT := 0; v_sev text; v_nivel text; v_prim numeric; v_sec numeric; v_amig text;
BEGIN
  FOR r IN SELECT * FROM public.alertas
    WHERE owner_id = p_owner_id AND ativo AND tipo = 'tag_digital' AND tag_nome = p_tag_nome
  LOOP
    IF p_valor_num = r.valor_ativacao AND (p_prev IS NULL OR p_prev <> r.valor_ativacao) THEN
      v_sev := r.severidade; v_nivel := NULL;
      IF r.tag_nivel_primario IS NOT NULL THEN
        SELECT valor_num INTO v_prim FROM public.tags_live WHERE owner_id = p_owner_id AND nome = r.tag_nivel_primario LIMIT 1;
      END IF;
      IF r.tag_nivel_secundario IS NOT NULL THEN
        SELECT valor_num INTO v_sec FROM public.tags_live WHERE owner_id = p_owner_id AND nome = r.tag_nivel_secundario LIMIT 1;
      END IF;
      IF v_prim = 1 THEN v_sev := 'critical'; v_nivel := 'primario';
      ELSIF v_sec = 1 THEN v_sev := 'warn'; v_nivel := 'secundario';
      END IF;
      SELECT nome_amigavel INTO v_amig FROM public.tags_live WHERE owner_id = p_owner_id AND nome = p_tag_nome LIMIT 1;
      INSERT INTO public.alertas_disparos(owner_id, alerta_id, alerta_nome, severidade, mensagem, contexto)
      VALUES (r.owner_id, r.id, r.nome, v_sev,
        format('Alarme CLP ativo: %s%s', COALESCE(v_amig, p_tag_nome),
          CASE v_nivel WHEN 'primario' THEN ' (primário)' WHEN 'secundario' THEN ' (secundário)' ELSE '' END),
        jsonb_build_object('tag_nome', p_tag_nome, 'valor_num', p_valor_num, 'origem', 'clp_digital', 'nivel', v_nivel));
      UPDATE public.alertas SET last_fired_at = now() WHERE id = r.id;
      fired := fired + 1;
    ELSIF p_valor_num <> r.valor_ativacao AND p_prev = r.valor_ativacao THEN
      UPDATE public.alertas_disparos
        SET status = 'resolvido', resolvido_em = now(),
            resolucao_nota = COALESCE(resolucao_nota, 'Normalizado automaticamente pelo CLP'),
            contexto = COALESCE(contexto,'{}'::jsonb) || jsonb_build_object('duracao_segundos', EXTRACT(EPOCH FROM now() - created_at)::int)
        WHERE alerta_id = r.id AND status <> 'resolvido';
    END IF;
  END LOOP;
  RETURN fired;
END $$;
REVOKE EXECUTE ON FUNCTION public.evaluate_tag_digital(uuid, text, numeric, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tags_live_alertas_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.valor_num IS NOT NULL THEN
    PERFORM public.evaluate_tag_alertas(NEW.owner_id, NEW.nome, NEW.valor_num, NEW.valor, NEW.unidade);
    PERFORM public.evaluate_tag_digital(NEW.owner_id, NEW.nome, NEW.valor_num,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.valor_num ELSE NULL END);
  END IF;
  RETURN NEW;
END $$;