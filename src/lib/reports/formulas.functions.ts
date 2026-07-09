import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

type Call = { name: string; args: string[] }
type Result = { value: string | number | null; error?: string }
export type ResolveContext = {
  /** Equipamento id/código/nome — usado quando o 1º argumento vier vazio em fórmulas de produção/manutenção */
  equipamento?: string
  /** Ordem de produção específica — quando presente e o campo pedido for de produção, usa esta OP em vez da última */
  ordem_id?: string
}

function applyCtx(name: string, args: string[], ctx?: ResolveContext): string[] {
  if (!ctx) return args
  const needsEquip = ['STHA_PROD_ULTIMA','STHA_PROD_SOMA','STHA_PROD_CONTAR','STHA_MANUT_ABERTAS','STHA_MANUT_ULTIMA'].includes(name)
  if (needsEquip && (!args[0] || !args[0].trim()) && ctx.equipamento) {
    return [ctx.equipamento, ...args.slice(1)]
  }
  return args
}

export async function resolveOneWithCtx(supabase: any, call: Call, ctx?: ResolveContext): Promise<Result> {
  const patched = { ...call, args: applyCtx(call.name, call.args, ctx) }
  // Special: STHA_PROD_ULTIMA with ctx.ordem_id → fetch that specific OP
  if (patched.name === 'STHA_PROD_ULTIMA' && ctx?.ordem_id) {
    const [, campo] = patched.args
    const { data } = await supabase
      .from('ordens_producao')
      .select('id, numero, qtd_produzida, qtd_planejada, status, inicio_em, fim_em')
      .eq('id', ctx.ordem_id)
      .maybeSingle()
    if (!data) return { value: null }
    return { value: (data as any)[campo] ?? null }
  }
  return resolveOne(supabase, patched)
}

async function resolveOne(supabase: any, call: Call): Promise<Result> {
  const { name, args } = call
  try {
    switch (name) {
      case 'STHA_PROD_ULTIMA': {
        const [equip, campo] = args
        const eqRow = await findEquip(supabase, equip)
        if (!eqRow) return { value: null, error: 'Equipamento não encontrado' }
        const { data, error } = await supabase
          .from('ordens_producao')
          .select(`id, numero, qtd_produzida, qtd_planejada, status, inicio_em, fim_em, created_at`)
          .eq('equipamento_id', eqRow.id)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) return { value: null, error: error.message }
        const row = data?.[0]
        if (!row) return { value: null }
        return { value: (row as any)[campo] ?? null }
      }
      case 'STHA_PROD_SOMA': {
        const [equip, de, ate] = args
        const eqRow = await findEquip(supabase, equip)
        if (!eqRow) return { value: null, error: 'Equipamento não encontrado' }
        let q = supabase.from('ordens_producao').select('qtd_produzida, created_at').eq('equipamento_id', eqRow.id)
        if (de) q = q.gte('created_at', toIso(de))
        if (ate) q = q.lte('created_at', toIso(ate, true))
        const { data, error } = await q
        if (error) return { value: null, error: error.message }
        const total = (data ?? []).reduce((a: number, r: any) => a + Number(r.qtd_produzida || 0), 0)
        return { value: total }
      }
      case 'STHA_PROD_CONTAR': {
        const [equip, de, ate] = args
        const eqRow = await findEquip(supabase, equip)
        if (!eqRow) return { value: null, error: 'Equipamento não encontrado' }
        let q = supabase.from('ordens_producao').select('id', { count: 'exact', head: true }).eq('equipamento_id', eqRow.id)
        if (de) q = q.gte('created_at', toIso(de))
        if (ate) q = q.lte('created_at', toIso(ate, true))
        const { count, error } = await q
        if (error) return { value: null, error: error.message }
        return { value: count ?? 0 }
      }
      case 'STHA_TAG_ATUAL': {
        const [tag] = args
        const { data, error } = await supabase.from('tags_live').select('valor_num, valor').eq('nome', tag).maybeSingle()
        if (error) return { value: null, error: error.message }
        if (!data) return { value: null }
        return { value: (data as any).valor_num ?? (data as any).valor ?? null }
      }
      case 'STHA_MANUT_ABERTAS': {
        const [equip] = args
        const eqRow = await findEquip(supabase, equip)
        if (!eqRow) return { value: null, error: 'Equipamento não encontrado' }
        const { count, error } = await supabase
          .from('ordens_manutencao')
          .select('id', { count: 'exact', head: true })
          .eq('equipamento_id', eqRow.id)
          .neq('status', 'concluida')
        if (error) return { value: null, error: error.message }
        return { value: count ?? 0 }
      }
      case 'STHA_MANUT_ULTIMA': {
        const [equip, campo] = args
        const eqRow = await findEquip(supabase, equip)
        if (!eqRow) return { value: null, error: 'Equipamento não encontrado' }
        const { data, error } = await supabase
          .from('ordens_manutencao')
          .select('numero, tipo, status, data_abertura, data_conclusao, custo, responsavel')
          .eq('equipamento_id', eqRow.id)
          .order('data_abertura', { ascending: false })
          .limit(1)
        if (error) return { value: null, error: error.message }
        const row = data?.[0]
        if (!row) return { value: null }
        return { value: (row as any)[campo] ?? null }
      }
      case 'STHA_ANALISE_ULTIMA': {
        const [analise] = args
        const anRow = await findAnalise(supabase, analise)
        if (!anRow) return { value: null, error: 'Análise não encontrada' }
        const { data, error } = await supabase
          .from('analises_registradas')
          .select('valor, registrado_em')
          .eq('analise_id', anRow.id)
          .order('registrado_em', { ascending: false })
          .limit(1)
        if (error) return { value: null, error: error.message }
        return { value: Number(data?.[0]?.valor) || 0 }
      }
      case 'STHA_ANALISE_MEDIA': {
        const [analise, de, ate] = args
        const anRow = await findAnalise(supabase, analise)
        if (!anRow) return { value: null, error: 'Análise não encontrada' }
        let q = supabase.from('analises_registradas').select('valor').eq('analise_id', anRow.id)
        if (de) q = q.gte('registrado_em', toIso(de))
        if (ate) q = q.lte('registrado_em', toIso(ate, true))
        const { data, error } = await q
        if (error) return { value: null, error: error.message }
        const nums = (data ?? []).map((r: any) => Number(r.valor)).filter((n: number) => !isNaN(n))
        if (!nums.length) return { value: 0 }
        return { value: nums.reduce((a: number, b: number) => a + b, 0) / nums.length }
      }
      case 'STHA_TANQUE_NIVEL': {
        const [tanque] = args
        const tqRow = await findTanque(supabase, tanque)
        if (!tqRow) return { value: null, error: 'Tanque não encontrado' }
        const { data, error } = await supabase
          .from('movimentacoes_estoque')
          .select('tipo, quantidade')
          .eq('tanque_id', tqRow.id)
        if (error) return { value: null, error: error.message }
        const saldo = (data ?? []).reduce((acc: number, r: any) => {
          const q = Number(r.quantidade || 0)
          return acc + (r.tipo === 'saida' ? -q : q)
        }, 0)
        return { value: saldo }
      }
      default:
        return { value: null, error: `Função desconhecida: ${name}` }
    }
  } catch (e: any) {
    return { value: null, error: e?.message ?? String(e) }
  }
}

async function findEquip(supabase: any, key: string) {
  if (!key) return null
  // try id, codigo, nome
  const { data } = await supabase
    .from('equipamentos')
    .select('id, codigo, nome')
    .or(`id.eq.${isUuid(key) ? key : '00000000-0000-0000-0000-000000000000'},codigo.ilike.${escapeLike(key)},nome.ilike.${escapeLike(key)}`)
    .limit(1)
  return data?.[0] ?? null
}
async function findTanque(supabase: any, key: string) {
  if (!key) return null
  const { data } = await supabase
    .from('tanques')
    .select('id, codigo, nome')
    .or(`id.eq.${isUuid(key) ? key : '00000000-0000-0000-0000-000000000000'},codigo.ilike.${escapeLike(key)},nome.ilike.${escapeLike(key)}`)
    .limit(1)
  return data?.[0] ?? null
}
async function findAnalise(supabase: any, key: string) {
  if (!key) return null
  const { data } = await supabase
    .from('parametros_cadastro')
    .select('id, nome')
    .or(`id.eq.${isUuid(key) ? key : '00000000-0000-0000-0000-000000000000'},nome.ilike.${escapeLike(key)}`)
    .limit(1)
  return data?.[0] ?? null
}
function isUuid(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) }
function escapeLike(s: string) { return s.replace(/[,()]/g, ' ') }
function toIso(v: string, endOfDay = false): string {
  // Accept YYYY-MM-DD or ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return endOfDay ? `${v}T23:59:59` : `${v}T00:00:00`
  return v
}

export const resolveFormulas = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { calls: Call[]; ctx?: ResolveContext }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase
    const out: Record<string, Result> = {}
    for (const call of data.calls) {
      const key = `${call.name}|${call.args.join('\u0001')}`
      out[key] = await resolveOneWithCtx(supabase, call, data.ctx)
    }
    return out
  })

export const listResolverOptions = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [eq, tq, an, prod, tags] = await Promise.all([
      context.supabase.from('equipamentos').select('id, codigo, nome').order('nome'),
      context.supabase.from('tanques').select('id, codigo, nome').order('nome'),
      context.supabase.from('parametros_cadastro').select('id, nome').order('nome'),
      context.supabase.from('produtos').select('id, codigo, nome').order('nome'),
      context.supabase.from('tags_live').select('nome, nome_amigavel').order('nome'),
    ])
    return {
      equipamentos: eq.data ?? [],
      tanques: tq.data ?? [],
      analises: an.data ?? [],
      produtos: prod.data ?? [],
      tags: tags.data ?? [],
    }
  })
