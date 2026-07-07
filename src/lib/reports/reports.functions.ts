import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

export const listReports = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('report_templates')
      .select('id, nome, descricao, tipo, updated_at, is_system_template, equipamento_ids, produto_ids, manutencao_ids, tanque_ids, analise_ids')
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as Array<Record<string, any>>
  })

export const getReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from('report_templates')
      .select('*')
      .eq('id', data.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!row) throw new Error('Relatório não encontrado')
    return row as Record<string, any>
  })

export const createReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    nome: string
    descricao?: string
    tipo?: string
    theme?: Record<string, any>
    canvas?: Record<string, any>
    page_size?: string
    orientation?: string
    equipamento_ids?: string[]
    produto_ids?: string[]
    manutencao_ids?: string[]
    tanque_ids?: string[]
    analise_ids?: string[]
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from('report_templates')
      .insert({
        owner_id: context.userId,
        created_by: context.userId,
        nome: data.nome,
        descricao: data.descricao ?? null,
        tipo: data.tipo ?? 'personalizado',
        theme: data.theme ?? { primary: '#2563eb', font: 'Inter' },
        canvas: data.canvas ?? { pages: [{ id: 'p1', blocks: [] }] },
        page_size: data.page_size ?? 'A4',
        orientation: data.orientation ?? 'portrait',
        equipamento_ids: data.equipamento_ids ?? [],
        produto_ids: data.produto_ids ?? [],
        manutencao_ids: data.manutencao_ids ?? [],
        tanque_ids: data.tanque_ids ?? [],
        analise_ids: data.analise_ids ?? [],
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return { id: row.id as string }
  })

export const updateReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string
    nome?: string
    descricao?: string | null
    tipo?: string
    theme?: Record<string, any>
    canvas?: Record<string, any>
    page_size?: string
    orientation?: string
    equipamento_ids?: string[]
    produto_ids?: string[]
    manutencao_ids?: string[]
    tanque_ids?: string[]
    analise_ids?: string[]
  }) => input)
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data
    const { error } = await (context.supabase as any)
      .from('report_templates')
      .update(patch)
      .eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })


export const deleteReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from('report_templates').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const listSchedules = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { report_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from('report_schedules')
      .select('*')
      .eq('report_id', data.report_id)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (rows ?? []) as Array<Record<string, any>>
  })

export const upsertSchedule = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string
    report_id: string
    nome: string
    ativo: boolean
    frequencia: string
    hora: string
    dias_semana: number[]
    dia_mes?: number | null
    recipient_user_ids: string[]
    email_template_key?: string
  }) => input)
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { id, ...patch } = data
      const { error } = await (context.supabase as any)
        .from('report_schedules').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
      return { id }
    }
    const { data: row, error } = await (context.supabase as any)
      .from('report_schedules')
      .insert({
        owner_id: context.userId,
        created_by: context.userId,
        ...data,
        email_template_key: data.email_template_key ?? 'report-ready',
      })
      .select('id').single()
    if (error) throw new Error(error.message)
    return { id: row.id as string }
  })

export const deleteSchedule = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from('report_schedules').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
