
-- 1) New columns on rotinas_atividades
ALTER TABLE public.rotinas_atividades
  ADD COLUMN IF NOT EXISTS notificar_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_recipients uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS email_template_key text NOT NULL DEFAULT 'rotina-evento';

-- 2) Extend dispatch_rotinas_atividades to include scheduled_at in a rich context
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
  v_tz text;
BEGIN
  FOR r IN SELECT * FROM public.rotinas_atividades WHERE ativo = true LOOP
    v_tz := COALESCE(r.timezone, 'America/Sao_Paulo');
    BEGIN
      v_local_ts := (now() AT TIME ZONE v_tz);
    EXCEPTION WHEN OTHERS THEN
      v_local_ts := (now() AT TIME ZONE 'America/Sao_Paulo');
      v_tz := 'America/Sao_Paulo';
    END;
    IF r.dias_semana IS NULL OR array_length(r.dias_semana, 1) IS NULL THEN CONTINUE; END IF;
    IF NOT (EXTRACT(DOW FROM v_local_ts)::int = ANY(r.dias_semana)) THEN CONTINUE; END IF;

    v_scheduled := (date_trunc('day', v_local_ts) + r.hora) AT TIME ZONE v_tz;

    IF now() >= v_scheduled AND now() < v_scheduled + interval '10 minutes' THEN
      IF r.last_fired_at IS NULL OR r.last_fired_at < v_scheduled THEN
        v_sev := COALESCE(NULLIF(r.severidade, ''), 'info');
        INSERT INTO public.alertas_disparos(
          owner_id, alerta_nome, severidade, mensagem, categoria, status, contexto
        ) VALUES (
          r.owner_id, r.nome, v_sev,
          COALESCE(NULLIF(r.descricao, ''), r.nome),
          'tarefa', 'novo',
          jsonb_build_object(
            'rotina_id', r.id,
            'scheduled_at', v_scheduled,
            'scheduled_date_br', to_char(v_scheduled AT TIME ZONE v_tz, 'DD/MM/YYYY'),
            'scheduled_time_br', to_char(v_scheduled AT TIME ZONE v_tz, 'HH24:MI'),
            'timezone', v_tz,
            'dias_semana', to_jsonb(r.dias_semana),
            'descricao', r.descricao
          )
        );
        UPDATE public.rotinas_atividades SET last_fired_at = now() WHERE id = r.id;
        fired := fired + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN fired;
END;
$function$;

-- 3) Extend alertas_disparo_notify_email trigger to also dispatch emails for rotinas
CREATE OR REPLACE FUNCTION public.alertas_disparo_notify_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alerta record;
  v_rotina record;
  v_key text;
  v_recipients uuid[];
  v_source_id uuid;
  v_rotina_id uuid;
BEGIN
  -- Alert-based dispatch (existing behavior)
  IF NEW.alerta_id IS NOT NULL THEN
    SELECT id, notificar_email, email_recipients, email_template_key
      INTO v_alerta FROM public.alertas WHERE id = NEW.alerta_id;

    IF NOT FOUND OR NOT v_alerta.notificar_email THEN RETURN NEW; END IF;
    IF v_alerta.email_recipients IS NULL OR array_length(v_alerta.email_recipients, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    v_key := COALESCE(v_alerta.email_template_key, 'alert');
    v_recipients := v_alerta.email_recipients;
    v_source_id := v_alerta.id;

  ELSE
    -- Rotina-based dispatch: look up rotina via contexto.rotina_id
    BEGIN
      v_rotina_id := NULLIF(NEW.contexto->>'rotina_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;
    IF v_rotina_id IS NULL THEN RETURN NEW; END IF;

    SELECT id, notificar_email, email_recipients, email_template_key
      INTO v_rotina FROM public.rotinas_atividades WHERE id = v_rotina_id;

    IF NOT FOUND OR NOT v_rotina.notificar_email THEN RETURN NEW; END IF;
    IF v_rotina.email_recipients IS NULL OR array_length(v_rotina.email_recipients, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    v_key := COALESCE(v_rotina.email_template_key, 'rotina-evento');
    v_recipients := v_rotina.email_recipients;
    v_source_id := v_rotina.id;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://project--f7e74e7f-ede1-4001-bbfc-b1e56be5c017.lovable.app/api/public/alertas/dispatch-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := jsonb_build_object(
        'disparo_id', NEW.id,
        'alerta_id', v_source_id,
        'template_key', v_key,
        'recipient_user_ids', to_jsonb(v_recipients),
        'severidade', NEW.severidade,
        'alerta_nome', NEW.alerta_nome,
        'mensagem', NEW.mensagem,
        'contexto', NEW.contexto
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'alertas_disparo_notify_email failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
