import * as React from 'react'
import { Button, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailShell, styles, BRAND } from './_shared'

interface Props {
  name?: string
  reportTitle?: string
  period?: string
  downloadUrl?: string
}

const ReportReadyEmail = ({ name, reportTitle, period, downloadUrl }: Props) => (
  <EmailShell preview={`Seu relatório ${reportTitle ?? ''} está pronto`}>
    <Text style={styles.heading}>Relatório disponível</Text>
    <Text style={styles.text}>
      Olá{name ? ` ${name}` : ''}, o relatório <strong>{reportTitle ?? 'solicitado'}</strong>
      {period ? ` referente a ${period}` : ''} foi gerado e está disponível para consulta.
    </Text>
    {downloadUrl ? (
      <Button
        href={downloadUrl}
        style={{
          backgroundColor: BRAND.primary,
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 600,
          textDecoration: 'none',
          display: 'inline-block',
          marginTop: '8px',
        }}
      >
        Abrir relatório
      </Button>
    ) : null}
    <Text style={styles.muted}>
      Você recebeu este e-mail porque solicitou a geração de um relatório no STHApc.
    </Text>
  </EmailShell>
)

export const template = {
  component: ReportReadyEmail,
  subject: (d: Record<string, any>) => `Relatório pronto: ${d.reportTitle ?? 'STHApc'}`,
  displayName: 'Relatório disponível',
  previewData: { name: 'Bruno', reportTitle: 'Produção Semanal', period: '01/07 a 07/07', downloadUrl: 'https://sthapc.cloud/relatorios' },
} satisfies TemplateEntry
