import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { executeRunInternal } from '@/lib/automation/runs.functions'

/**
 * Server-side dispatcher for automation_runs.
 * Executes runs that are ready without requiring anyone to have the app open.
 *
 * Picks up:
 *   - status = 'approved'  → executes directly
 *   - status = 'snoozed'   → executes when snoozed_until has passed
 *
 * Runs that require human approval ('pending_approval') are left untouched.
 *
 * Auth: Bearer <SUPABASE_SERVICE_ROLE_KEY> (called by pg_cron via the vault secret).
 */
export const Route = createFileRoute('/api/public/automation/dispatch-runs')({
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

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        const nowIso = new Date().toISOString()

        // Auto-liberar snoozed vencidos
        await admin
          .from('automation_runs')
          .update({ status: 'approved' })
          .eq('status', 'snoozed')
          .lte('snoozed_until', nowIso)

        // Buscar runs aprovados (FIFO)
        const { data: rows, error } = await admin
          .from('automation_runs')
          .select('id, owner_id, created_at')
          .eq('status', 'approved')
          .order('created_at', { ascending: true })
          .limit(50)

        if (error) {
          return Response.json({ error: error.message }, { status: 500 })
        }

        const runs = (rows ?? []) as Array<{ id: string; owner_id: string }>
        const results: Array<{ run_id: string; ok: boolean; error?: string }> = []

        for (const run of runs) {
          try {
            const res = await executeRunInternal(admin, run.owner_id, run.id)
            results.push({ run_id: run.id, ok: res.ok })
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            // Registra a falha no próprio run para não travar o próximo ciclo
            await admin
              .from('automation_runs')
              .update({
                status: 'failed',
                executed_at: new Date().toISOString(),
                error_message: msg.slice(0, 500),
              })
              .eq('id', run.id)
            results.push({ run_id: run.id, ok: false, error: msg })
          }
        }

        return Response.json({ ok: true, processed: runs.length, results })
      },
    },
  },
})
