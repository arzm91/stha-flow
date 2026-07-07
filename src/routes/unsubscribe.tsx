import { pageHead } from '@/lib/seo'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type State =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'already' }
  | { kind: 'invalid' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

export const Route = createFileRoute('/unsubscribe')({
  head: pageHead({
    title: 'Cancelar assinatura de e-mails — STHApc',
    description: 'Confirme o cancelamento do recebimento de e-mails do STHApc.',
    path: '/unsubscribe',
  }),
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === 'string' ? s.token : undefined,
  }),
  component: UnsubscribePage,
})

function UnsubscribePage() {
  const { token } = Route.useSearch()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' })
      return
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) return setState({ kind: 'invalid' })
        if (j.valid === false && j.reason === 'already_unsubscribed') return setState({ kind: 'already' })
        if (j.valid === true) return setState({ kind: 'ready' })
        setState({ kind: 'invalid' })
      })
      .catch(() => setState({ kind: 'invalid' }))
  }, [token])

  const confirm = async () => {
    if (!token) return
    setSubmitting(true)
    try {
      const r = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return setState({ kind: 'error', message: j?.error ?? 'Erro ao processar.' })
      if (j.success) return setState({ kind: 'success' })
      if (j.reason === 'already_unsubscribed') return setState({ kind: 'already' })
      setState({ kind: 'error', message: 'Não foi possível concluir.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="dark min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Cancelar recebimento de e-mails</CardTitle>
          <CardDescription>STHApc — Gestão Industrial</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === 'loading' && <p className="text-sm text-muted-foreground">Validando link…</p>}
          {state.kind === 'invalid' && (
            <p className="text-sm text-muted-foreground">
              Link inválido ou expirado. Se você quer parar de receber e-mails, use o link mais recente enviado no rodapé de qualquer mensagem.
            </p>
          )}
          {state.kind === 'already' && (
            <p className="text-sm text-muted-foreground">Este e-mail já havia sido descadastrado.</p>
          )}
          {state.kind === 'ready' && (
            <>
              <p className="text-sm text-muted-foreground">
                Confirme abaixo para deixar de receber e-mails do STHApc neste endereço.
              </p>
              <Button onClick={confirm} disabled={submitting} className="w-full">
                {submitting ? 'Processando…' : 'Confirmar cancelamento'}
              </Button>
            </>
          )}
          {state.kind === 'success' && (
            <p className="text-sm text-muted-foreground">
              Pronto. Você não receberá mais e-mails do STHApc neste endereço.
            </p>
          )}
          {state.kind === 'error' && <p className="text-sm text-destructive">{state.message}</p>}
        </CardContent>
      </Card>
    </main>
  )
}
