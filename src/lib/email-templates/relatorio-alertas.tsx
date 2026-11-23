import * as React from 'react'
import { Button, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailShell, styles, BRAND } from './_shared'

interface Linha { nome: string; severidade: string; inicio: string; duracao: string; status: string }
interface Props {
  periodo?: string
  total?: number
  criticos?: number
  atencao?: number
  ativos?: number
  top?: Array<{ nome: string; qtd: number }>
  linhas?: Linha[]
  url?: string
}

const sevCor = (s: string) => (s === 'critical' || s === 'critico' ? '#b91c1c' : s === 'warning' || s === 'atencao' ? '#b45309' : '#374151')
const sevTxt = (s: string) => (s === 'critical' || s === 'critico' ? 'Crítico' : s === 'warning' || s === 'atencao' ? 'Atenção' : 'Info')
const td = { padding: '6px 8px', fontSize: '12px', borderBottom: `1px solid ${BRAND.border}`, color: BRAND.text }
const th = { ...td, fontWeight: 700, backgroundColor: BRAND.surface, textAlign: 'left' as const }

const RelatorioAlertas = ({ periodo, total = 0, criticos = 0, atencao = 0, ativos = 0, top = [], linhas = [], url }: Props) => (
  <EmailShell preview={`Relatório de alertas: ${total} ocorrência(s)`}>
    <Text style={styles.heading}>Relatório de alertas</Text>
    <Text style={styles.muted}>{periodo ?? 'Últimas 24 horas'}</Text>
    <table width="100%" cellPadding={0} cellSpacing={0} style={{ margin: '12px 0' }}>
      <tbody><tr>
        {[['Total', total, BRAND.text], ['Críticos', criticos, '#b91c1c'], ['Atenção', atencao, '#b45309'], ['Ainda ativos', ativos, BRAND.primaryDark]].map(([l, v, c]) => (
          <td key={String(l)} style={{ border: `1px solid ${BRAND.border}`, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: BRAND.muted }}>{l}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: String(c) }}>{v}</div>
          </td>
        ))}
      </tr></tbody>
    </table>
    {top.length > 0 ? (
      <>
        <Text style={{ ...styles.text, fontWeight: 700 }}>Mais recorrentes</Text>
        {top.map((t) => <Text key={t.nome} style={{ ...styles.muted, margin: '2px 0' }}>{t.qtd}× {t.nome}</Text>)}
      </>
    ) : null}
    {linhas.length > 0 ? (
      <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginTop: '16px', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Início</th><th style={th}>Alerta</th><th style={th}>Nível</th><th style={th}>Duração</th></tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td style={td}>{l.inicio}</td>
              <td style={td}>{l.nome}</td>
              <td style={{ ...td, color: sevCor(l.severidade), fontWeight: 700 }}>{sevTxt(l.severidade)}</td>
              <td style={td}>{l.duracao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <Text style={styles.text}>Nenhum alerta registrado no período.</Text>
    )}
    {url ? (
      <Button href={url} style={{ backgroundColor: BRAND.primary, color: '#ffffff', padding: '10px 18px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: '16px' }}>
        Abrir relatórios
      </Button>
    ) : null}
    <Text style={styles.muted}>Envio automático programado nas Automações do STHApc.</Text>
  </EmailShell>
)

export const template = {
  component: RelatorioAlertas,
  subject: (d: Record<string, any>) => `Relatório de alertas — ${d.periodo ?? 'últimas 24h'}`,
  displayName: 'Relatório de alertas (agendado)',
  previewData: { periodo: 'Últimas 24h', total: 3, criticos: 1, atencao: 2, ativos: 0, top: [{ nome: 'PUMP_OFF', qtd: 2 }], linhas: [{ nome: 'PUMP_OFF', severidade: 'critical', inicio: '22/11 10:00', duracao: '5 min', status: 'resolvido' }] },
} satisfies TemplateEntry
