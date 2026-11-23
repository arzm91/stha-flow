import * as React from 'react'
import { Button, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailShell, styles, BRAND } from './_shared'

interface Props { titulo?: string; periodo?: string; resumo?: Array<[string, string]>; url?: string }

const RelatorioPdf = ({ titulo = 'Relatório', periodo, resumo = [], url }: Props) => (
  <EmailShell preview={`${titulo} em PDF`}>
    <Text style={styles.heading}>{titulo}</Text>
    <Text style={styles.muted}>{periodo}</Text>
    <table width="100%" cellPadding={0} cellSpacing={0} style={{ margin: '12px 0' }}>
      <tbody><tr>
        {resumo.map(([l, v]) => (
          <td key={l} style={{ border: `1px solid ${BRAND.border}`, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: BRAND.muted }}>{l}</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: BRAND.text }}>{v}</div>
          </td>
        ))}
      </tr></tbody>
    </table>
    {url ? (
      <Button href={url} style={{ backgroundColor: BRAND.primary, color: '#ffffff', padding: '12px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: '8px' }}>
        Baixar relatório em PDF
      </Button>
    ) : null}
    <Text style={styles.muted}>O link do PDF vale por 7 dias. Envio automático programado nas Automações do STHApc.</Text>
  </EmailShell>
)

export const template = {
  component: RelatorioPdf,
  subject: (d: Record<string, any>) => `${d.titulo ?? 'Relatório'} — ${d.periodo ?? ''}`,
  displayName: 'Relatório em PDF (agendado)',
  previewData: { titulo: 'Relatório de produção', periodo: '22/11/2026 08:00 a 23/11/2026 08:00', resumo: [['Ordens', '3'], ['Produzido', '68.000']], url: 'https://sthapc.cloud' },
} satisfies TemplateEntry
