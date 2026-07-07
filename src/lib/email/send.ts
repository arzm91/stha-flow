import { supabase } from '@/integrations/supabase/client'

export interface SendTransactionalEmailInput {
  templateName: 'report-ready' | 'order-confirmation' | 'alert' | 'message' | (string & {})
  recipientEmail: string
  idempotencyKey: string
  templateData?: Record<string, unknown>
}

/**
 * Envia um e-mail transacional autenticado através do endpoint interno.
 * Requer sessão Supabase ativa (usa o JWT do usuário logado).
 */
export async function sendTransactionalEmail(input: SendTransactionalEmailInput): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão não encontrada. Faça login novamente.')

  const res = await fetch('/lovable/email/transactional/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    let msg = `Falha ao enviar e-mail (${res.status})`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch { /* noop */ }
    throw new Error(msg)
  }
}
