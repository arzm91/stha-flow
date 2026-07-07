
-- 1. Novas colunas em alertas
ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS email_recipients uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS email_template_key text NOT NULL DEFAULT 'alert';

-- 2. Trigger: quando um disparo é criado e o alerta tem notificar_email + destinatários,
-- faz POST para a rota pública que enfileira os e-mails.
CREATE OR REPLACE FUNCTION public.alertas_disparo_notify_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_alerta record;
  v_key text;
BEGIN
  IF NEW.alerta_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, notificar_email, email_recipients, email_template_key
    INTO v_alerta FROM public.alertas WHERE id = NEW.alerta_id;

  IF NOT FOUND OR NOT v_alerta.notificar_email THEN RETURN NEW; END IF;
  IF v_alerta.email_recipients IS NULL OR array_length(v_alerta.email_recipients, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_key := COALESCE(v_alerta.email_template_key, 'alert');

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
        'alerta_id', v_alerta.id,
        'template_key', v_key,
        'recipient_user_ids', to_jsonb(v_alerta.email_recipients),
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
$$;

REVOKE EXECUTE ON FUNCTION public.alertas_disparo_notify_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_alertas_disparo_notify_email ON public.alertas_disparos;
CREATE TRIGGER trg_alertas_disparo_notify_email
  AFTER INSERT ON public.alertas_disparos
  FOR EACH ROW EXECUTE FUNCTION public.alertas_disparo_notify_email();
