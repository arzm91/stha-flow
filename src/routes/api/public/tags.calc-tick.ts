import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { evaluateCalcTags, type CalcTag } from '@/lib/tags/calc'

/**
 * Recalcula tags calculadas do tipo "formula" no servidor, para todos os
 * tenants, e grava o resultado em tags_live — o que dispara gatilhos de
 * automação, alertas e histórico mesmo sem ninguém com o app aberto.
 *
 * Tipos "delta_janela" e "acumulador_janela" são tratados por jobs próprios.
 *
 * Auth: Bearer <SUPABASE_SERVICE_ROLE_KEY> (chamado pelo pg_cron).
 */
export const Route = createFileRoute('/api/public/tags/calc-tick')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const supabaseUrl = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL
        if (!serviceKey || !supabaseUrl) {
          return Response.json({ error: 'server_misconfigured' }, { status: 500 })
        }

        const authHeader = request.headers.get('Authorization') ?? ''
        if (!authHeader.startsWith('Bearer ') || authHeader.slice(7).trim() !== serviceKey) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        const { data: calcRows, error } = await admin
          .from('tags_calculadas')
          .select('*')
          .eq('ativo', true)
        if (error) return Response.json({ error: error.message }, { status: 500 })

        const calc = (calcRows ?? []) as unknown as CalcTag[]
        const formulas = calc.filter((t) => !t.tipo || t.tipo === 'formula')
        if (!formulas.length) return Response.json({ ok: true, updated: 0 })

        const owners = [...new Set(formulas.map((t) => t.owner_id))]
        const nowIso = new Date().toISOString()
        let updated = 0
        const errors: Array<{ owner: string; error: string }> = []

        for (const owner of owners) {
          try {
            const { data: liveRows } = await admin
              .from('tags_live')
              .select('nome, valor_num')
              .eq('owner_id', owner)

            const base = new Map<string, number>()
            for (const r of (liveRows ?? []) as Array<{ nome: string; valor_num: number | null }>) {
              if (r.valor_num != null) base.set(r.nome, Number(r.valor_num))
            }

            const ownerCalc = formulas.filter((t) => t.owner_id === owner)
            const results = evaluateCalcTags(ownerCalc, base)

            const upserts = ownerCalc
              .map((t) => {
                const r = results.get(t.nome)
                const valor = r?.valor ?? null
                if (valor == null || !Number.isFinite(valor)) return null
                return {
                  nome: t.nome,
                  nome_amigavel: t.nome_amigavel,
                  valor: String(valor),
                  valor_num: valor,
                  valor_num_bruto: valor,
                  unidade: t.unidade,
                  grupo: t.grupo ?? 'Calculadas',
                  qualidade: 'good',
                  valor_min: t.valor_min,
                  valor_max: t.valor_max,
                  origem: 'calculada',
                  owner_id: owner,
                  atualizado_em: nowIso,
                }
              })
              .filter(Boolean) as Array<Record<string, unknown>>

            if (upserts.length) {
              const { error: upErr } = await admin
                .from('tags_live')
                .upsert(upserts, { onConflict: 'owner_id,nome' })
              if (upErr) errors.push({ owner, error: upErr.message })
              else updated += upserts.length
            }
          } catch (e) {
            errors.push({ owner, error: e instanceof Error ? e.message : String(e) })
          }
        }

        return Response.json({ ok: errors.length === 0, updated, errors })
      },
    },
  },
})
