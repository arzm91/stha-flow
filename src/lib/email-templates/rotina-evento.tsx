import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailShell, styles, BRAND } from './_shared'

interface Props {
  routineName?: string
  description?: string
  eventDate?: string
  eventTime?: string
  timezone?: string
  weekday?: string
  severity?: string
}

const SEV_LABEL: Record<string, string> = {
  info: 'Informativo',
  warn: 'Atenção',
  critical: 'Crítico',
}

const SEV_STYLE: Record<string, { bg: string; color: string }> = {
  info: { bg: '#e0f2fe', color: '#075985' },
  warn: { bg: '#fef3c7', color: '#92400e' },
  critical: { bg: '#fee2e2', color: '#991b1b' },
}

const RotinaEventoEmail = ({
  routineName,
  description,
  eventDate,
  eventTime,
  timezone,
  weekday,
  severity,
}: Props) => {
  const sev = (severity ?? 'info').toLowerCase()
  const sevStyle = SEV_STYLE[sev] ?? SEV_STYLE.info
  const sevLabel = SEV_LABEL[sev] ?? 'Informativo'
  return (
    <EmailShell preview={`📅 ${routineName ?? 'Rotina'} · ${eventDate ?? ''} ${eventTime ?? ''}`}>
      <div style={{ textAlign: 'center' as const, marginBottom: 8 }}>
        <span style={styles.badge(sevStyle.bg, sevStyle.color)}>Evento agendado · {sevLabel}</span>
      </div>
      <Text style={{ ...styles.heading, textAlign: 'center' as const }}>
        {routineName ?? 'Rotina programada'}
      </Text>

      {/* Big date/time card, like a calendar tile */}
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${BRAND.border}`,
          overflow: 'hidden',
          margin: '20px 0',
        }}
      >
        <div
          style={{
            backgroundColor: BRAND.primary,
            color: '#ffffff',
            padding: '10px 16px',
            fontSize: 13,
            letterSpacing: 1,
            textTransform: 'uppercase' as const,
            fontWeight: 700,
            textAlign: 'center' as const,
          }}
        >
          {weekday ?? 'Hoje'}
        </div>
        <div style={{ padding: '20px 16px', textAlign: 'center' as const, backgroundColor: BRAND.surface }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: BRAND.text, lineHeight: 1 }}>
            {eventTime ?? '—'}
          </div>
          <div style={{ marginTop: 6, fontSize: 15, color: BRAND.muted }}>
            {eventDate ?? '—'}
          </div>
          {timezone ? (
            <div style={{ marginTop: 2, fontSize: 12, color: BRAND.muted }}>{timezone}</div>
          ) : null}
        </div>
      </div>

      {description ? (
        <div style={styles.panel}>
          <p style={styles.rowLabel}>Descrição</p>
          <p style={{ ...styles.rowValue, marginBottom: 0, whiteSpace: 'pre-wrap' as const }}>{description}</p>
        </div>
      ) : null}

      <Text style={styles.muted}>
        Confirme e execute esta rotina no horário programado. Acompanhe também na central de notificações do STHApc, aba <b>Tarefas</b>.
      </Text>
    </EmailShell>
  )
}

export const template = {
  component: RotinaEventoEmail,
  subject: (d: Record<string, any>) =>
    `📅 ${d.routineName ?? 'Rotina'} — ${d.eventDate ?? ''} ${d.eventTime ?? ''}`.trim(),
  displayName: 'Evento de rotina',
  previewData: {
    routineName: 'Ronda de campo',
    description: 'Verificar níveis dos tanques e registrar leituras no sistema.',
    eventDate: '08/07/2026',
    eventTime: '08:00',
    timezone: 'America/Sao_Paulo',
    weekday: 'Quarta-feira',
    severity: 'info',
  },
} satisfies TemplateEntry
