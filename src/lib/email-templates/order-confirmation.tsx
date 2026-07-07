import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailShell, styles } from './_shared'

interface Props {
  name?: string
  orderNumber?: string
  product?: string
  quantity?: string | number
  scheduledFor?: string
}

const OrderConfirmationEmail = ({ name, orderNumber, product, quantity, scheduledFor }: Props) => (
  <EmailShell preview={`Ordem ${orderNumber ?? ''} confirmada`}>
    <Text style={styles.heading}>Ordem de produção confirmada</Text>
    <Text style={styles.text}>
      Olá{name ? ` ${name}` : ''}, a ordem de produção foi registrada com sucesso no STHApc.
    </Text>
    <div style={styles.panel}>
      <p style={styles.rowLabel}>Número da ordem</p>
      <p style={styles.rowValue}>{orderNumber ?? '—'}</p>
      <p style={styles.rowLabel}>Produto</p>
      <p style={styles.rowValue}>{product ?? '—'}</p>
      <p style={styles.rowLabel}>Quantidade</p>
      <p style={styles.rowValue}>{quantity ?? '—'}</p>
      <p style={styles.rowLabel}>Programada para</p>
      <p style={{ ...styles.rowValue, marginBottom: 0 }}>{scheduledFor ?? '—'}</p>
    </div>
    <Text style={styles.muted}>
      Acompanhe o andamento em tempo real no painel de produção do sistema.
    </Text>
  </EmailShell>
)

export const template = {
  component: OrderConfirmationEmail,
  subject: (d: Record<string, any>) => `Ordem ${d.orderNumber ?? ''} confirmada — STHApc`,
  displayName: 'Confirmação de ordem',
  previewData: { name: 'Bruno', orderNumber: 'OP-2026-0142', product: 'Solução XY 30%', quantity: '5.000 L', scheduledFor: '08/07/2026 07:00' },
} satisfies TemplateEntry
