import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailShell, styles, BRAND } from './_shared'

interface Props {
  name?: string
  fromName?: string
  subject?: string
  body?: string
  replyUrl?: string
}

const MessageEmail = ({ name, fromName, subject, body, replyUrl }: Props) => (
  <EmailShell preview={subject ?? 'Nova mensagem no STHApc'}>
    <Text style={styles.heading}>{subject ?? 'Você recebeu uma mensagem'}</Text>
    <Text style={styles.text}>
      Olá{name ? ` ${name}` : ''}, você recebeu uma nova mensagem
      {fromName ? ` de ${fromName}` : ''} no STHApc.
    </Text>
    <div style={{ ...styles.panel, borderLeft: `3px solid ${BRAND.primary}` }}>
      <p style={{ ...styles.rowValue, whiteSpace: 'pre-wrap', margin: 0 }}>{body ?? ''}</p>
    </div>
    {replyUrl ? (
      <Text style={styles.text}>
        <a href={replyUrl} style={{ color: BRAND.primary, fontWeight: 600 }}>Responder no sistema →</a>
      </Text>
    ) : null}
  </EmailShell>
)

export const template = {
  component: MessageEmail,
  subject: (d: Record<string, any>) => d.subject ?? 'Nova mensagem — STHApc',
  displayName: 'Mensagem interna',
  previewData: {
    name: 'Bruno',
    fromName: 'Supervisão de Produção',
    subject: 'Ajuste na programação de amanhã',
    body: 'Prezado, precisamos antecipar a ordem OP-0142 em 1h. Confirme o recebimento.',
    replyUrl: 'https://sthapc.cloud/alertas',
  },
} satisfies TemplateEntry
