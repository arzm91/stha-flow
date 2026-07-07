import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailShell, styles } from './_shared'

type Severity = 'info' | 'warning' | 'critical'

interface Props {
  name?: string
  severity?: Severity
  alertTitle?: string
  source?: string
  detectedAt?: string
  description?: string
  actionUrl?: string
}

const severityStyle: Record<Severity, { bg: string; color: string; label: string }> = {
  info: { bg: '#e0f2fe', color: '#075985', label: 'Informativo' },
  warning: { bg: '#fef3c7', color: '#92400e', label: 'Atenção' },
  critical: { bg: '#fee2e2', color: '#991b1b', label: 'Crítico' },
}

const AlertEmail = ({ name, severity = 'warning', alertTitle, source, detectedAt, description, actionUrl }: Props) => {
  const s = severityStyle[severity] ?? severityStyle.warning
  return (
    <EmailShell preview={`[${s.label}] ${alertTitle ?? 'Novo alerta'}`}>
      <span style={styles.badge(s.bg, s.color)}>{s.label}</span>
      <Text style={styles.heading}>{alertTitle ?? 'Novo alerta registrado'}</Text>
      <Text style={styles.text}>
        {name ? `${name}, ` : ''}um alerta foi disparado no STHApc e precisa da sua atenção.
      </Text>
      <div style={styles.panel}>
        <p style={styles.rowLabel}>Origem</p>
        <p style={styles.rowValue}>{source ?? '—'}</p>
        <p style={styles.rowLabel}>Detectado em</p>
        <p style={styles.rowValue}>{detectedAt ?? '—'}</p>
        <p style={styles.rowLabel}>Descrição</p>
        <p style={{ ...styles.rowValue, marginBottom: 0 }}>{description ?? '—'}</p>
      </div>
      {actionUrl ? (
        <Text style={styles.text}>
          <a href={actionUrl} style={{ color: s.color, fontWeight: 600 }}>Abrir alerta no sistema →</a>
        </Text>
      ) : null}
    </EmailShell>
  )
}

export const template = {
  component: AlertEmail,
  subject: (d: Record<string, any>) => {
    const sev = (d.severity as Severity) ?? 'warning'
    return `[${severityStyle[sev]?.label ?? 'Alerta'}] ${d.alertTitle ?? 'STHApc'}`
  },
  displayName: 'Alerta do sistema',
  previewData: {
    name: 'Bruno',
    severity: 'critical',
    alertTitle: 'Temperatura acima do limite',
    source: 'Tanque TQ-04 · Sensor TT-102',
    detectedAt: '07/07/2026 14:32',
    description: 'Temperatura atingiu 92°C (limite 85°C) por mais de 3 minutos.',
    actionUrl: 'https://sthapc.cloud/alertas',
  },
} satisfies TemplateEntry
