import { createContext, useContext, type ReactNode } from 'react'

export interface ReportScope {
  equipamentoIds: string[]
  produtoIds: string[]
  tanqueIds: string[]
  analiseIds: string[]
}

export const EMPTY_SCOPE: ReportScope = { equipamentoIds: [], produtoIds: [], tanqueIds: [], analiseIds: [] }

const ScopeCtx = createContext<ReportScope>(EMPTY_SCOPE)

export function ReportScopeProvider({ scope, children }: { scope: ReportScope; children: ReactNode }) {
  return <ScopeCtx.Provider value={scope}>{children}</ScopeCtx.Provider>
}

export function useReportScope(): ReportScope {
  return useContext(ScopeCtx)
}
