import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

/**
 * Lista os usuários do owner efetivo (admin + membros da conta) com id, nome e e-mail.
 * Usado no formulário de alertas para escolher destinatários de e-mail.
 */
export const listAccountUsers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: ownerRow, error: ownerErr } = await supabaseAdmin.rpc('effective_owner', {
      _user: context.userId,
    })
    if (ownerErr) throw new Error(ownerErr.message)
    const ownerId = (ownerRow as string | null) ?? context.userId

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, email, created_by')
      .or(`id.eq.${ownerId},created_by.eq.${ownerId}`)
      .order('nome', { ascending: true })
    if (error) throw new Error(error.message)

    return (data ?? []).map((p) => ({
      id: p.id as string,
      nome: (p.nome as string | null) ?? '',
      email: (p.email as string | null) ?? '',
    }))
  })
