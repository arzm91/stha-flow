import type { Canvas, Theme } from './types'

export interface SeedTemplate {
  key: string
  nome: string
  descricao: string
  tipo: 'manutencao' | 'producao'
  theme: Theme
  canvas: Canvas
}

const uid = () => Math.random().toString(36).slice(2, 10)

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    key: 'os-manutencao',
    nome: 'Ordem de Serviço — Manutenção',
    descricao: 'Modelo pronto para OS de manutenção com dados do equipamento, materiais e assinaturas.',
    tipo: 'manutencao',
    theme: { primary: '#0f766e', font: 'Inter' },
    canvas: {
      pages: [
        {
          id: 'p1',
          blocks: [
            { id: uid(), type: 'heading', x: 40, y: 30, w: 500, h: 50,
              props: { text: 'Ordem de Serviço de Manutenção', fontSize: 24, color: '#0f766e', bold: true, align: 'left' } },
            { id: uid(), type: 'text', x: 40, y: 85, w: 500, h: 24,
              props: { text: 'Emitida em {{data_hoje}} — {{hora_agora}}', fontSize: 12, color: '#475569', align: 'left' } },
            { id: uid(), type: 'divider', x: 40, y: 115, w: 710, h: 8, props: { color: '#0f766e', thickness: 2 } },
            { id: uid(), type: 'heading', x: 40, y: 140, w: 400, h: 30,
              props: { text: 'Ordens em aberto', fontSize: 16, color: '#0f172a', bold: true, align: 'left' } },
            { id: uid(), type: 'table', x: 40, y: 180, w: 710, h: 300,
              props: { title: '', dataSource: { source: 'ordens_manutencao', columns: ['numero','tipo','status','prioridade','responsavel','data_abertura'], period: '30d', limit: 20 },
                headerColor: '#0f766e', stripe: true } },
            { id: uid(), type: 'heading', x: 40, y: 500, w: 400, h: 30,
              props: { text: 'Observações', fontSize: 14, color: '#0f172a', bold: true, align: 'left' } },
            { id: uid(), type: 'text', x: 40, y: 535, w: 710, h: 100,
              props: { text: '_________________________________________________________________________\n\n_________________________________________________________________________', fontSize: 12, color: '#334155', align: 'left' } },
            { id: uid(), type: 'signature', x: 40, y: 950, w: 300, h: 60, props: { label: 'Técnico Responsável', lineColor: '#0f172a' } },
            { id: uid(), type: 'signature', x: 450, y: 950, w: 300, h: 60, props: { label: 'Supervisor', lineColor: '#0f172a' } },
          ],
        },
      ],
    },
  },
  {
    key: 'produtividade-diaria',
    nome: 'Produtividade Diária',
    descricao: 'Relatório com KPIs de produção, gráfico e tabela de ordens do dia.',
    tipo: 'producao',
    theme: { primary: '#2563eb', font: 'Inter' },
    canvas: {
      pages: [
        {
          id: 'p1',
          blocks: [
            { id: uid(), type: 'heading', x: 40, y: 30, w: 500, h: 50,
              props: { text: 'Relatório de Produtividade', fontSize: 24, color: '#2563eb', bold: true, align: 'left' } },
            { id: uid(), type: 'text', x: 40, y: 85, w: 500, h: 24,
              props: { text: 'Gerado em {{data_hoje}}', fontSize: 12, color: '#475569', align: 'left' } },
            { id: uid(), type: 'divider', x: 40, y: 115, w: 710, h: 8, props: { color: '#2563eb', thickness: 2 } },
            { id: uid(), type: 'kpi', x: 40, y: 140, w: 220, h: 110,
              props: { label: 'Ordens (30 dias)', dataSource: { source: 'ordens_producao', columns: ['id'], period: '30d', limit: 500 }, aggregate: 'count', color: '#2563eb' } },
            { id: uid(), type: 'kpi', x: 285, y: 140, w: 220, h: 110,
              props: { label: 'Quantidade Total', dataSource: { source: 'ordens_producao', columns: ['quantidade'], period: '30d', limit: 500 }, aggregate: 'sum', field: 'quantidade', color: '#0f766e', unit: 'un' } },
            { id: uid(), type: 'kpi', x: 530, y: 140, w: 220, h: 110,
              props: { label: 'Análises (30 dias)', dataSource: { source: 'analises_registradas', columns: ['id'], period: '30d', limit: 500 }, aggregate: 'count', color: '#7c3aed' } },
            { id: uid(), type: 'heading', x: 40, y: 275, w: 400, h: 30,
              props: { text: 'Ordens Recentes', fontSize: 16, color: '#0f172a', bold: true, align: 'left' } },
            { id: uid(), type: 'table', x: 40, y: 315, w: 710, h: 400,
              props: { dataSource: { source: 'ordens_producao', columns: ['numero','produto_nome','quantidade','status','iniciado_em','finalizado_em'], period: '30d', limit: 25 },
                headerColor: '#2563eb', stripe: true } },
          ],
        },
      ],
    },
  },
]
