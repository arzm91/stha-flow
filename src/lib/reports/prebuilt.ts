import type { Canvas } from './types'
import type { ReportScope } from './scope-context'

const uid = () => crypto.randomUUID()

/** Builds a canvas by stacking selected pre-built blocks vertically. */
export function buildPrebuiltCanvas(scope: ReportScope, keys: string[], primary = '#2563eb'): Canvas {
  const blocks: any[] = []
  let y = 30
  const width = 710

  const push = (h: number, factory: (id: string, yy: number) => any) => {
    blocks.push(factory(uid(), y))
    y += h + 15
  }

  if (keys.includes('titulo')) {
    push(50, (id, yy) => ({ id, type: 'heading', x: 40, y: yy, w: width, h: 50,
      props: { text: 'Relatório', fontSize: 24, color: primary, bold: true, align: 'left' } }))
    push(24, (id, yy) => ({ id, type: 'text', x: 40, y: yy, w: width, h: 24,
      props: { text: 'Gerado em {{data_hoje}} — {{hora_agora}}', fontSize: 12, color: '#475569', align: 'left' } }))
    push(8, (id, yy) => ({ id, type: 'divider', x: 40, y: yy, w: width, h: 8,
      props: { color: primary, thickness: 2 } }))
  }

  // Equipamentos KPIs side by side
  const kpiKeys = ['kpi_24h', 'kpi_andamento'].filter((k) => keys.includes(k))
  if (kpiKeys.length) {
    const kw = kpiKeys.length === 2 ? 345 : width
    let x = 40
    kpiKeys.forEach((k) => {
      if (k === 'kpi_24h') {
        blocks.push({ id: uid(), type: 'kpi', x, y, w: kw, h: 110,
          props: { label: 'Produzido nas últimas 24h', color: '#0f766e', unit: 'un',
            aggregate: 'sum', field: 'qtd_produzida',
            dataSource: { source: 'ordens_producao', columns: ['qtd_produzida'], period: '24h', limit: 500, useScope: true } } })
      } else {
        blocks.push({ id: uid(), type: 'kpi', x, y, w: kw, h: 110,
          props: { label: 'Produções em andamento', color: primary,
            aggregate: 'count',
            dataSource: { source: 'ordens_producao', columns: ['id','status'], period: 'all', limit: 500, useScope: true, filters: { status: 'em_andamento' } } } })
      }
      x += kw + 20
    })
    y += 110 + 15
  }

  if (keys.includes('tabela_producoes')) {
    push(280, (id, yy) => ({ id, type: 'table', x: 40, y: yy, w: width, h: 280,
      props: { title: 'Produções do período', headerColor: primary, stripe: true,
        dataSource: { source: 'ordens_producao', columns: ['numero','status','qtd_planejada','qtd_produzida','inicio_em','fim_em'], period: '30d', limit: 30, useScope: true } } }))
  }

  if (keys.includes('grafico_producoes')) {
    push(240, (id, yy) => ({ id, type: 'chart', x: 40, y: yy, w: width, h: 240,
      props: { title: 'Qtd. produzida por ordem', chartType: 'bar', xField: 'numero', yField: 'qtd_produzida', color: primary,
        dataSource: { source: 'ordens_producao', columns: ['numero','qtd_produzida'], period: '30d', limit: 20, useScope: true } } }))
  }

  if (keys.includes('tabela_manutencoes')) {
    push(240, (id, yy) => ({ id, type: 'table', x: 40, y: yy, w: width, h: 240,
      props: { title: 'Ordens de manutenção', headerColor: '#dc2626', stripe: true,
        dataSource: { source: 'ordens_manutencao', columns: ['numero','tipo','status','prioridade','responsavel','data_abertura'], period: '30d', limit: 20, useScope: true } } }))
  }

  if (keys.includes('tabela_estoque')) {
    push(260, (id, yy) => ({ id, type: 'table', x: 40, y: yy, w: width, h: 260,
      props: { title: 'Movimentações de estoque', headerColor: '#0891b2', stripe: true,
        dataSource: { source: 'movimentacoes_estoque', columns: ['tipo','quantidade','origem','destino','ocorrido_em'], period: '30d', limit: 30, useScope: true } } }))
  }

  if (keys.includes('tabela_saldos')) {
    push(200, (id, yy) => ({ id, type: 'table', x: 40, y: yy, w: width, h: 200,
      props: { title: 'Tanques', headerColor: '#0f766e', stripe: true,
        dataSource: { source: 'tanques', columns: ['codigo','nome','capacidade','unidade','tipo'], period: 'all', limit: 50, useScope: true } } }))
  }

  if (keys.includes('tabela_analises')) {
    push(260, (id, yy) => ({ id, type: 'table', x: 40, y: yy, w: width, h: 260,
      props: { title: 'Análises registradas', headerColor: '#7c3aed', stripe: true,
        dataSource: { source: 'analises_registradas', columns: ['resultado','registrado_em'], period: '30d', limit: 30, useScope: true } } }))
  }

  if (keys.includes('grafico_analises')) {
    push(240, (id, yy) => ({ id, type: 'chart', x: 40, y: yy, w: width, h: 240,
      props: { title: 'Evolução do resultado', chartType: 'line', xField: 'registrado_em', yField: 'resultado', color: '#7c3aed',
        dataSource: { source: 'analises_registradas', columns: ['registrado_em','resultado'], period: '30d', limit: 100, useScope: true } } }))
  }

  // ignore scope to keep linter happy
  void scope
  return { pages: [{ id: 'p1', blocks }] }
}
