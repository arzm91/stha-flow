
-- 1) Tabela de destinatários SMS (gerida por admins)
CREATE TABLE public.sms_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_recipients_telefone_e164 CHECK (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  UNIQUE (owner_id, telefone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_recipients TO authenticated;
GRANT ALL ON public.sms_recipients TO service_role;

ALTER TABLE public.sms_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam destinatarios SMS do owner"
  ON public.sms_recipients
  FOR ALL
  TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER trg_sms_recipients_owner
  BEFORE INSERT ON public.sms_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();

CREATE TRIGGER trg_sms_recipients_updated_at
  BEFORE UPDATE ON public.sms_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Log de envios SMS
CREATE TABLE public.sms_send_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  alerta_id UUID,
  disparo_id UUID,
  telefone TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enviado',
  provider_message_id TEXT,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.sms_send_log TO authenticated;
GRANT ALL ON public.sms_send_log TO service_role;

ALTER TABLE public.sms_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem log SMS do owner"
  ON public.sms_send_log
  FOR SELECT
  TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Service role escreve log SMS"
  ON public.sms_send_log
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));

CREATE INDEX idx_sms_send_log_owner_created ON public.sms_send_log(owner_id, created_at DESC);

-- 3) Flags de SMS nos alertas existentes (não altera comportamento atual)
ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS notificar_sms BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_recipients UUID[] NOT NULL DEFAULT '{}';
