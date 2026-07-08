
-- 1) Limpeza das tabelas/campos de SMS
DROP TABLE IF EXISTS public.sms_send_log CASCADE;
DROP TABLE IF EXISTS public.sms_recipients CASCADE;
ALTER TABLE public.alertas DROP COLUMN IF EXISTS notificar_sms;
ALTER TABLE public.alertas DROP COLUMN IF EXISTS sms_recipients;

-- 2) Dispositivos com push habilitado (por usuário)
CREATE TABLE public.push_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rotulo TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  plataforma TEXT NOT NULL DEFAULT 'web',
  user_agent TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultima_notificacao_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fcm_token)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
GRANT ALL ON public.push_devices TO service_role;

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario gerencia seus dispositivos push"
  ON public.push_devices
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND owner_id = public.effective_owner(auth.uid()));

CREATE POLICY "Admins veem dispositivos do owner"
  ON public.push_devices
  FOR SELECT
  TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER trg_push_devices_owner
  BEFORE INSERT ON public.push_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER trg_push_devices_updated_at
  BEFORE UPDATE ON public.push_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_push_devices_owner_ativo ON public.push_devices(owner_id, ativo);

-- 3) Log de envios push
CREATE TABLE public.push_send_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  alerta_id UUID,
  disparo_id UUID,
  device_id UUID,
  titulo TEXT NOT NULL,
  corpo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enviado',
  provider_message_id TEXT,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.push_send_log TO authenticated;
GRANT ALL ON public.push_send_log TO service_role;

ALTER TABLE public.push_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem log push do owner"
  ON public.push_send_log
  FOR SELECT
  TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Service role escreve log push"
  ON public.push_send_log
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE INDEX idx_push_send_log_owner_created ON public.push_send_log(owner_id, created_at DESC);

-- 4) Flags de push nos alertas (não altera comportamento atual)
ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS notificar_push BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_recipients UUID[] NOT NULL DEFAULT '{}';
