
CREATE TABLE IF NOT EXISTS public.rotinas_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  dias_semana int[] NOT NULL DEFAULT '{}',
  hora time NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  severidade text NOT NULL DEFAULT 'info',
  ativo boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotinas_atividades TO authenticated;
GRANT ALL ON public.rotinas_atividades TO service_role;

ALTER TABLE public.rotinas_atividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_rotinas_all" ON public.rotinas_atividades;
CREATE POLICY "own_rotinas_all" ON public.rotinas_atividades
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_rotinas_owner ON public.rotinas_atividades(owner_id);
CREATE INDEX IF NOT EXISTS idx_rotinas_ativo ON public.rotinas_atividades(ativo) WHERE ativo = true;

CREATE OR REPLACE FUNCTION public.rotinas_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_rotinas_updated_at ON public.rotinas_atividades;
CREATE TRIGGER trg_rotinas_updated_at
  BEFORE UPDATE ON public.rotinas_atividades
  FOR EACH ROW EXECUTE FUNCTION public.rotinas_touch_updated_at();

CREATE OR REPLACE FUNCTION public.dispatch_rotinas_atividades()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  fired int := 0;
  v_local_ts timestamp;
  v_scheduled timestamptz;
  v_sev text;
BEGIN
  FOR r IN SELECT * FROM public.rotinas_atividades WHERE ativo = true LOOP
    BEGIN
      v_local_ts := (now() AT TIME ZONE COALESCE(r.timezone, 'America/Sao_Paulo'));
    EXCEPTION WHEN OTHERS THEN
      v_local_ts := (now() AT TIME ZONE 'America/Sao_Paulo');
    END;
    IF r.dias_semana IS NULL OR array_length(r.dias_semana, 1) IS NULL THEN CONTINUE; END IF;
    IF NOT (EXTRACT(DOW FROM v_local_ts)::int = ANY(r.dias_semana)) THEN CONTINUE; END IF;

    v_scheduled := (date_trunc('day', v_local_ts) + r.hora)
                   AT TIME ZONE COALESCE(r.timezone, 'America/Sao_Paulo');

    IF now() >= v_scheduled AND now() < v_scheduled + interval '10 minutes' THEN
      IF r.last_fired_at IS NULL OR r.last_fired_at < v_scheduled THEN
        v_sev := COALESCE(NULLIF(r.severidade, ''), 'info');
        INSERT INTO public.alertas_disparos(
          owner_id, alerta_nome, severidade, mensagem, categoria, status, contexto
        ) VALUES (
          r.owner_id, r.nome, v_sev,
          COALESCE(NULLIF(r.descricao, ''), r.nome),
          'tarefa', 'novo',
          jsonb_build_object('rotina_id', r.id, 'scheduled_at', v_scheduled)
        );
        UPDATE public.rotinas_atividades SET last_fired_at = now() WHERE id = r.id;
        fired := fired + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN fired;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dispatch_rotinas_atividades() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_rotinas_atividades() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-rotinas-atividades');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'dispatch-rotinas-atividades',
  '* * * * *',
  $cron$SELECT public.dispatch_rotinas_atividades();$cron$
);
