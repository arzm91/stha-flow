/**
 * Client-side catalog of STHA formulas.
 * Names use underscores because HyperFormula function names cannot contain dots.
 */
export type ArgKind = 'text' | 'number' | 'date' | 'equipamento' | 'produto' | 'tanque' | 'tag' | 'analise' | 'campo'

export type FormulaArg = {
  key: string
  label: string
  kind: ArgKind
  optional?: boolean
  options?: { value: string; label: string }[] // for `campo`
}

export type FormulaDef = {
  name: string       // e.g. "STHA_PROD_ULTIMA"
  label: string      // human-readable
  category: string
  description: string
  returns: 'number' | 'text' | 'date'
  args: FormulaArg[]
}

export const FORMULAS: FormulaDef[] = [
  {
    name: 'STHA_PROD_ULTIMA',
    label: 'Última produção',
    category: 'Produção',
    description: 'Retorna o valor da última ordem de produção de um equipamento.',
    returns: 'number',
    args: [
      { key: 'equipamento', label: 'Equipamento', kind: 'equipamento' },
      {
        key: 'campo', label: 'Campo', kind: 'campo',
        options: [
          { value: 'qtd_produzida', label: 'Qtd. produzida' },
          { value: 'qtd_planejada', label: 'Qtd. planejada' },
          { value: 'numero', label: 'Número da OP' },
          { value: 'status', label: 'Status' },
          { value: 'inicio_em', label: 'Início' },
          { value: 'fim_em', label: 'Fim' },
        ],
      },
    ],
  },
  {
    name: 'STHA_PROD_SOMA',
    label: 'Soma de produção no período',
    category: 'Produção',
    description: 'Soma qtd_produzida das ordens de produção do equipamento no período.',
    returns: 'number',
    args: [
      { key: 'equipamento', label: 'Equipamento', kind: 'equipamento' },
      { key: 'de', label: 'Data de', kind: 'date' },
      { key: 'ate', label: 'Data até', kind: 'date' },
    ],
  },
  {
    name: 'STHA_PROD_CONTAR',
    label: 'Contar ordens de produção',
    category: 'Produção',
    description: 'Conta ordens de produção do equipamento no período.',
    returns: 'number',
    args: [
      { key: 'equipamento', label: 'Equipamento', kind: 'equipamento' },
      { key: 'de', label: 'Data de', kind: 'date' },
      { key: 'ate', label: 'Data até', kind: 'date' },
    ],
  },
  {
    name: 'STHA_TAG_ATUAL',
    label: 'Valor atual da tag',
    category: 'Tags',
    description: 'Retorna o último valor numérico registrado para a tag.',
    returns: 'number',
    args: [{ key: 'tag', label: 'Tag', kind: 'tag' }],
  },
  {
    name: 'STHA_MANUT_ABERTAS',
    label: 'OS de manutenção abertas',
    category: 'Manutenção',
    description: 'Conta ordens de manutenção do equipamento com status ≠ concluída.',
    returns: 'number',
    args: [{ key: 'equipamento', label: 'Equipamento', kind: 'equipamento' }],
  },
  {
    name: 'STHA_MANUT_ULTIMA',
    label: 'Última manutenção',
    category: 'Manutenção',
    description: 'Retorna um campo da última OS de manutenção do equipamento.',
    returns: 'text',
    args: [
      { key: 'equipamento', label: 'Equipamento', kind: 'equipamento' },
      {
        key: 'campo', label: 'Campo', kind: 'campo',
        options: [
          { value: 'data_conclusao', label: 'Data conclusão' },
          { value: 'data_abertura', label: 'Data abertura' },
          { value: 'status', label: 'Status' },
          { value: 'tipo', label: 'Tipo' },
          { value: 'custo', label: 'Custo' },
          { value: 'responsavel', label: 'Responsável' },
        ],
      },
    ],
  },
  {
    name: 'STHA_ANALISE_ULTIMA',
    label: 'Última análise',
    category: 'Qualidade',
    description: 'Retorna o último valor registrado para a análise (por nome).',
    returns: 'number',
    args: [{ key: 'analise', label: 'Análise', kind: 'analise' }],
  },
  {
    name: 'STHA_ANALISE_MEDIA',
    label: 'Média de análises',
    category: 'Qualidade',
    description: 'Média dos valores da análise no período informado.',
    returns: 'number',
    args: [
      { key: 'analise', label: 'Análise', kind: 'analise' },
      { key: 'de', label: 'Data de', kind: 'date' },
      { key: 'ate', label: 'Data até', kind: 'date' },
    ],
  },
  {
    name: 'STHA_TANQUE_NIVEL',
    label: 'Nível do tanque',
    category: 'Estoque',
    description: 'Retorna o saldo atual (soma de movimentações) do tanque.',
    returns: 'number',
    args: [{ key: 'tanque', label: 'Tanque', kind: 'tanque' }],
  },
]

export const FORMULA_BY_NAME: Record<string, FormulaDef> = Object.fromEntries(FORMULAS.map((f) => [f.name, f]))

/** Extract STHA calls from a formula string (only top-level; ignores nested). */
export function extractSthaCalls(formula: string): { name: string; args: string[] }[] {
  if (!formula || !formula.startsWith('=')) return []
  const out: { name: string; args: string[] }[] = []
  const re = /\bSTHA_[A-Z_]+\s*\(([^()]*)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(formula))) {
    const name = m[0].split('(')[0].trim()
    const argsStr = m[1]
    const args = splitArgs(argsStr)
    if (FORMULA_BY_NAME[name]) out.push({ name, args })
  }
  return out
}

function splitArgs(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let inStr = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"') { inStr = !inStr; cur += ch; continue }
    if (!inStr && (ch === ',' || ch === ';')) { out.push(cleanArg(cur)); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cleanArg(cur))
  return out
}

function cleanArg(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

export function buildCallKey(name: string, args: string[]): string {
  return `${name}|${args.map((a) => a).join('\u0001')}`
}
