-- Push-only alerts must dispatch notifications even when email is disabled.
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
  v_recipients uuid[] := '{}'::uuid[];
  v_push_recipients uuid[] := '{}'::uuid[];
  v_source_id uuid;
  v_rotina_id uuid;
BEGIN
  -- Alert-based dispatch: e-mail and/or push.
  IF NEW.alerta_id IS NOT NULL THEN
    SELECT id, notificar_email, email_recipients, email_template_key, notificar_push, push_recipients
      INTO v_alerta FROM public.alertas WHERE id = NEW.alerta_id;

    IF NOT FOUND THEN RETURN NEW; END IF;

    IF COALESCE(v_alerta.notificar_email, false) THEN
      v_recipients := COALESCE(v_alerta.email_recipients, '{}'::uuid[]);
    END IF;

    IF COALESCE(v_alerta.notificar_push, false) THEN
      v_push_recipients := COALESCE(v_alerta.push_recipients, '{}'::uuid[]);
    END IF;

    IF COALESCE(array_length(v_recipients, 1), 0) = 0
       AND COALESCE(array_length(v_push_recipients, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;

    v_key := COALESCE(v_alerta.email_template_key, 'alert');
    v_source_id := v_alerta.id;

  ELSE
    -- Rotina-based dispatch: e-mail behavior preserved.
    BEGIN
      v_rotina_id := NULLIF(NEW.contexto->>'rotina_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;
    IF v_rotina_id IS NULL THEN RETURN NEW; END IF;

    SELECT id, notificar_email, email_recipients, email_template_key
      INTO v_rotina FROM public.rotinas_atividades WHERE id = v_rotina_id;

    IF NOT FOUND OR NOT v_rotina.notificar_email THEN RETURN NEW; END IF;
    v_recipients := COALESCE(v_rotina.email_recipients, '{}'::uuid[]);
    IF COALESCE(array_length(v_recipients, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;

    v_key := COALESCE(v_rotina.email_template_key, 'rotina-evento');
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

REVOKE EXECUTE ON FUNCTION public.alertas_disparo_notify_email() FROM PUBLIC, anon, authenticated;

-- Keep push device ownership aligned on token refresh/upsert as well as first insert.
DROP TRIGGER IF EXISTS trg_push_devices_owner ON public.push_devices;
CREATE TRIGGER trg_push_devices_owner
  BEFORE INSERT OR UPDATE ON public.push_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();