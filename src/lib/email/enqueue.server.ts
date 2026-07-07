// Server-only helper: renders a registered template and enqueues it into
// the transactional email queue. Uses the admin (service_role) client so it
// can be called from background contexts (automation runs, cron) without a
// user JWT.
//
// Mirrors the logic in /lovable/email/transactional/send but skinnied down
// for internal callers that already trust the recipient/template inputs.

import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'stha-flow'
const SENDER_DOMAIN = 'notify.stha.com.br'
const FROM_DOMAIN = 'stha.com.br'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export type EnqueueResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'template_not_found' | 'email_suppressed' | 'enqueue_failed'; error?: string }

export async function enqueueTransactionalEmail(params: {
  templateName: string
  recipientEmail: string
  templateData?: Record<string, unknown>
  idempotencyKey?: string
}): Promise<EnqueueResult> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

  const template = TEMPLATES[params.templateName]
  if (!template) return { ok: false, reason: 'template_not_found' }

  const effectiveRecipient = (template.to || params.recipientEmail || '').trim()
  if (!effectiveRecipient) return { ok: false, reason: 'enqueue_failed', error: 'no recipient' }

  const normalized = effectiveRecipient.toLowerCase()
  const messageId = crypto.randomUUID()
  const idempotencyKey = params.idempotencyKey ?? messageId
  const templateData = params.templateData ?? {}

  // Suppression check
  const { data: suppressed } = await supabaseAdmin
    .from('suppressed_emails')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()
  if (suppressed) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: params.templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })
    return { ok: false, reason: 'email_suppressed' }
  }

  // Unsubscribe token
  let unsubscribeToken: string
  const { data: existingToken } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalized)
    .maybeSingle()

  if (existingToken?.used_at) {
    return { ok: false, reason: 'email_suppressed' }
  }
  if (existingToken?.token) {
    unsubscribeToken = existingToken.token
  } else {
    unsubscribeToken = generateToken()
    await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalized },
        { onConflict: 'email', ignoreDuplicates: true },
      )
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalized)
      .maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token
  }

  // Render
  const element = React.createElement(template.component, templateData as never)
  const html = await render(element)
  const plainText = await render(element, { plainText: true })
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: params.templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: params.templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: params.templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: enqueueError.message,
    })
    return { ok: false, reason: 'enqueue_failed', error: enqueueError.message }
  }

  return { ok: true, messageId }
}
