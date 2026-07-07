import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { enqueueTransactionalEmail } from '@/lib/email/enqueue.server'

// Runs every 5 minutes via pg_cron. Scans active schedules and enqueues
// a "report-ready" email for each schedule that is due, then updates
// last_fired_at and records a report_run.

const DAY_MIN = 60 * 24
const WINDOW_MIN = 10

function toLocalHM(date: Date, tz: string): { day: number; minute: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const y = get('year'), m = get('month'), d = get('day'), h = get('hour'), min = get('minute'), wk = get('weekday')
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>
  return { day: days[wk] ?? 0, minute: Number(h) * 60 + Number(min), ymd: `${y}-${m}-${d}` }
}

export const Route = createFileRoute('/api/public/relatorios/dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const supabaseUrl = process.env.SUPABASE_URL
        if (!serviceKey || !supabaseUrl) return Response.json({ error: 'server_misconfigured' }, { status: 500 })

        const authHeader = request.headers.get('Authorization') ?? ''
        if (!authHeader.startsWith('Bearer ') || authHeader.slice(7).trim() !== serviceKey) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        const now = new Date()

        const { data: schedules, error } = await admin
          .from('report_schedules')
          .select('id, report_id, owner_id, nome, frequencia, hora, dias_semana, dia_mes, timezone, recipient_user_ids, email_template_key, last_fired_at')
          .eq('ativo', true)
        if (error) return Response.json({ error: error.message }, { status: 500 })

        let dispatched = 0
        for (const s of schedules ?? []) {
          const tz = (s as any).timezone || 'America/Sao_Paulo'
          const local = toLocalHM(now, tz)
          const [hh, mm] = String((s as any).hora).slice(0, 5).split(':').map(Number)
          const scheduledMinute = (hh || 0) * 60 + (mm || 0)
          const deltaMin = ((local.minute - scheduledMinute) + DAY_MIN) % DAY_MIN
          if (deltaMin > WINDOW_MIN) continue

          const freq = (s as any).frequencia as string
          if (freq === 'semanal' || freq === 'diaria') {
            const days = ((s as any).dias_semana ?? []) as number[]
            if (freq === 'semanal' && !days.includes(local.day)) continue
            if (freq === 'diaria' && days.length > 0 && !days.includes(local.day)) continue
          } else if (freq === 'mensal') {
            const dayOfMonth = Number(local.ymd.split('-')[2])
            if (Number((s as any).dia_mes ?? 1) !== dayOfMonth) continue
          }

          const last = (s as any).last_fired_at ? new Date((s as any).last_fired_at) : null
          if (last) {
            const lastLocal = toLocalHM(last, tz)
            if (lastLocal.ymd === local.ymd && lastLocal.minute >= scheduledMinute - 1) continue
          }

          // Fetch report + recipients
          const { data: report } = await admin
            .from('report_templates').select('id, nome').eq('id', (s as any).report_id).maybeSingle()
          if (!report) continue

          const ids = ((s as any).recipient_user_ids ?? []) as string[]
          if (ids.length === 0) continue
          const { data: profs } = await admin.from('profiles').select('id, email').in('id', ids)
          const emails = (profs ?? []).map((p: any) => p.email).filter((e: any) => e && String(e).includes('@'))

          const key = (s as any).email_template_key || 'report-ready'
          const runId = crypto.randomUUID()
          for (const email of emails) {
            await enqueueTransactionalEmail({
              templateName: key,
              recipientEmail: email,
              templateData: {
                reportName: (report as any).nome,
                period: now.toISOString(),
                downloadUrl: `https://sthapc.cloud/relatorios/${(report as any).id}`,
              },
              idempotencyKey: `report-${(s as any).id}-${local.ymd}-${scheduledMinute}-${email}`,
            })
          }

          await admin.from('report_schedules').update({ last_fired_at: now.toISOString() }).eq('id', (s as any).id)
          await admin.from('report_runs').insert({
            owner_id: (s as any).owner_id,
            report_id: (report as any).id,
            schedule_id: (s as any).id,
            status: 'success',
            triggered_by: 'schedule',
            recipient_user_ids: ids,
            finished_at: now.toISOString(),
          })
          dispatched += emails.length
          void runId
        }

        return Response.json({ ok: true, dispatched })
      },
    },
  },
})
