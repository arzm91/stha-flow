import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { enqueueTransactionalEmail } from '@/lib/email/enqueue.server'

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
        if (ids.length === 0) return Response.json({ ok: true, sent: 0 })

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

        return Response.json({ ok: true, sent, total: emails.length })
      },
    },
  },
})
