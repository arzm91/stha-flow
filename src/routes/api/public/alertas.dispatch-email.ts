import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { enqueueTransactionalEmail } from '@/lib/email/enqueue.server'
import { sendFcmMessage } from '@/lib/push/fcm.server'

type Body = {
  disparo_id?: string
  alerta_id?: string
  template_key?: string
  recipient_user_ids?: string[]
  severidade?: string
  alerta_nome?: string
  mensagem?: string
  contexto?: Record<string, unknown> | null
}

function buildTemplateData(key: string, body: Body): Record<string, unknown> {
  const ctx = (body.contexto ?? {}) as Record<string, unknown>
  const nowIso = new Date().toISOString()
  if (key === 'alert') {
    return {
      severity: body.severidade ?? 'info',
      alertTitle: body.alerta_nome ?? 'Alerta do sistema',
      source: (ctx.tag_nome as string) ?? (ctx.evento as string) ?? '—',
      description: body.mensagem ?? '',
      detectedAt: nowIso,
    }
  }
  if (key === 'message') {
    return {
      subject: body.alerta_nome ?? 'Nova mensagem — STHApc',
      body: body.mensagem ?? '',
      fromName: 'STHApc — Alertas',
    }
  }
  if (key === 'order-confirmation') {
    return {
      orderNumber: (ctx.ordem_id as string) ?? '—',
      productName: (ctx.produto as string) ?? '—',
      quantity: (ctx.quantidade as string) ?? '—',
      startDate: nowIso,
    }
  }
  if (key === 'report-ready') {
    return {
      reportName: body.alerta_nome ?? 'Relatório',
      period: nowIso,
      downloadUrl: 'https://sthapc.cloud/relatorios',
    }
  }
  if (key === 'rotina-evento') {
    const weekdayNames = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
      'Quinta-feira', 'Sexta-feira', 'Sábado',
    ]
    let weekday: string | undefined
    const scheduledAt = ctx.scheduled_at as string | undefined
    if (scheduledAt) {
      const d = new Date(scheduledAt)
      if (!isNaN(d.getTime())) weekday = weekdayNames[d.getDay()]
    }
    return {
      routineName: body.alerta_nome ?? 'Rotina',
      description: (ctx.descricao as string) ?? body.mensagem ?? '',
      eventDate: (ctx.scheduled_date_br as string) ?? '',
      eventTime: (ctx.scheduled_time_br as string) ?? '',
      timezone: (ctx.timezone as string) ?? '',
      weekday: weekday ?? '',
      severity: body.severidade ?? 'info',
    }
  }
  return { ...ctx, mensagem: body.mensagem }
}

export const Route = createFileRoute('/api/public/alertas/dispatch-email')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const supabaseUrl = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL
        if (!serviceKey || !supabaseUrl) {
          return Response.json({ error: 'server_misconfigured' }, { status: 500 })
        }

        const authHeader = request.headers.get('Authorization') ?? ''
        if (!authHeader.startsWith('Bearer ')) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }
        const token = authHeader.slice(7).trim()
        if (token !== serviceKey) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        let body: Body
        try {
          body = (await request.json()) as Body
        } catch {
          return Response.json({ error: 'invalid_json' }, { status: 400 })
        }

        const ids = Array.isArray(body.recipient_user_ids) ? body.recipient_user_ids : []
        if (ids.length === 0) return Response.json({ ok: true, sent: 0, push_sent: 0 })

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data: profiles, error: profErr } = await admin
          .from('profiles')
          .select('id,email')
          .in('id', ids)
        if (profErr) {
          console.error('dispatch-email: profiles lookup failed', profErr)
          return Response.json({ error: 'profiles_lookup_failed' }, { status: 500 })
        }

        const emails = (profiles ?? [])
          .map((p) => (p as { email: string | null }).email)
          .filter((e): e is string => Boolean(e && e.includes('@')))

        const key = body.template_key || 'alert'
        const templateData = buildTemplateData(key, body)
        const idempotencyBase = body.disparo_id ?? crypto.randomUUID()

        let sent = 0
        for (const email of emails) {
          const result = await enqueueTransactionalEmail({
            templateName: key,
            recipientEmail: email,
            templateData,
            idempotencyKey: `alerta-${idempotencyBase}-${email}`,
          })
          if (result.ok) sent += 1
          else console.warn('dispatch-email enqueue failed', { email, reason: result.reason })
        }

        // Push notifications — only if alert has notificar_push=true and push_recipients set
        let pushSent = 0
        try {
          if (body.alerta_id && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            const { data: alerta } = await admin
              .from('alertas')
              .select('notificar_push, push_recipients, nome, severidade, owner_id')
              .eq('id', body.alerta_id)
              .maybeSingle()

            const pushIds = (alerta?.push_recipients ?? []) as string[]
            if (alerta?.notificar_push && pushIds.length > 0) {
              const { data: devices } = await admin
                .from('push_devices')
                .select('id, fcm_token, user_id')
                .in('user_id', pushIds)
                .eq('ativo', true)

              const title = `[${(alerta.severidade ?? 'info').toUpperCase()}] ${body.alerta_nome ?? alerta.nome ?? 'Alerta STHApc'}`
              const msgBody = body.mensagem ?? ''
              const url = 'https://sthapc.cloud/alertas'

              for (const dev of devices ?? []) {
                const res = await sendFcmMessage({
                  token: dev.fcm_token,
                  title,
                  body: msgBody,
                  url,
                  data: {
                    alerta_id: String(body.alerta_id),
                    disparo_id: String(body.disparo_id ?? ''),
                  },
                })
                await admin.from('push_send_log').insert({
                  owner_id: alerta.owner_id,
                  device_id: dev.id,
                  alerta_id: body.alerta_id,
                  disparo_id: body.disparo_id ?? null,
                  titulo: title,
                  corpo: msgBody,
                  status: res.ok ? 'sent' : 'error',
                  provider_message_id: res.ok ? res.messageId : null,
                  erro: res.ok ? null : res.error.slice(0, 500),
                })
                if (res.ok) {
                  pushSent += 1
                  await admin
                    .from('push_devices')
                    .update({ ultima_notificacao_em: new Date().toISOString() })
                    .eq('id', dev.id)
                } else if (res.status === 404 || res.status === 400) {
                  // Token invalid/unregistered → deactivate
                  await admin.from('push_devices').update({ ativo: false }).eq('id', dev.id)
                }
              }
            }
          }
        } catch (err) {
          console.error('dispatch-email: push send failed', err)
        }

        return Response.json({ ok: true, sent, total: emails.length, push_sent: pushSent })
      },
    },
  },
})
