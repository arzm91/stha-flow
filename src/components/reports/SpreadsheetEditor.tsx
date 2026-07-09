import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle, useLayoutEffect } from 'react'
import { HotTable } from '@handsontable/react'
import Handsontable from 'handsontable'
import { HyperFormula } from 'hyperformula'
import 'handsontable/styles/handsontable.min.css'
import 'handsontable/styles/ht-theme-main.min.css'
import { registerAllModules } from 'handsontable/registry'
import { useServerFn } from '@tanstack/react-start'
import { resolveFormulas } from '@/lib/reports/formulas.functions'
import { extractSthaCalls } from '@/lib/reports/formulas-catalog'
import type { Workbook, Sheet, CellStyle, SheetObject } from '@/lib/reports/spreadsheet-types'
import { DEFAULT_COLS, DEFAULT_ROWS } from '@/lib/reports/spreadsheet-types'
import { SpreadsheetObjectsLayer } from './SpreadsheetObjectsLayer'

registerAllModules()

const HANDSONTABLE_LICENSE = 'non-commercial-and-evaluation'

export type SpreadsheetEditorHandle = {
  getWorkbook: () => Workbook
  recalcSthaAll: () => Promise<void>
  applyStyleToSelection: (patch: Partial<CellStyle>) => void
  insertAtActive: (value: string) => void
  addObject: (obj: SheetObject) => void
}

type Props = {
  workbook: Workbook
  onChange?: (wb: Workbook) => void
  onActiveSheetChange?: (sheet: Sheet) => void
}

export const SpreadsheetEditor = forwardRef<SpreadsheetEditorHandle, Props>(function SpreadsheetEditor(
  { workbook, onChange, onActiveSheetChange },
  ref,
) {
  const [wb, setWb] = useState<Workbook>(workbook)
  const [activeId, setActiveId] = useState(workbook.activeSheetId)
  const hotRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 500 })
  const resolve = useServerFn(resolveFormulas)

  useEffect(() => { setWb(workbook); setActiveId(workbook.activeSheetId) }, [workbook])

  const activeSheet = wb.sheets.find((s) => s.id === activeId) ?? wb.sheets[0]

  useEffect(() => { onActiveSheetChange?.(activeSheet) }, [activeSheet, onActiveSheetChange])

  // Measure container to give Handsontable an explicit numeric height (percentages
  // don't render reliably inside flex containers here).
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const update = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(200, Math.floor(r.width)), h: Math.max(200, Math.floor(r.height)) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const displayData = useMemo(() => {
    return activeSheet.data.map((row, r) =>
      row.map((val, c) => {
        if (typeof val === 'string' && val.startsWith('=') && /STHA_/.test(val)) {
          const cached = activeSheet.sthaCache[`${r},${c}`]
          return cached ?? '…'
        }
        return val
      }),
    )
  }, [activeSheet])

  const cellsFn = useMemo(() => {
    return (row: number, col: number) => {
      const st = activeSheet.styles[`${row},${col}`]
      const meta: any = {}
      if (st) {
        meta.className = ['cell-custom']
        const cellStyle: Record<string, string> = {}
        if (st.bold) cellStyle.fontWeight = 'bold'
        if (st.italic) cellStyle.fontStyle = 'italic'
        if (st.underline) cellStyle.textDecoration = 'underline'
        if (st.color) cellStyle.color = st.color
        if (st.bg) cellStyle.backgroundColor = st.bg
        if (st.fontSize) cellStyle.fontSize = `${st.fontSize}px`
        if (st.fontFamily) cellStyle.fontFamily = st.fontFamily
        if (st.align) cellStyle.textAlign = st.align
        meta.renderer = (
          _instance: any, TD: HTMLElement, _r: number, _c: number, _prop: any, value: any,
        ) => {
          Object.assign(TD.style, cellStyle)
          TD.innerText = value == null ? '' : String(value)
        }
      }
      return meta
    }
  }, [activeSheet])

  const updateSheet = (mut: (s: Sheet) => Sheet) => {
    const next: Workbook = {
      ...wb,
      sheets: wb.sheets.map((s) => (s.id === activeId ? mut(s) : s)),
    }
    setWb(next); onChange?.(next)
  }

  const handleAfterChange = (changes: any[] | null, source: string) => {
    if (source === 'loadData' || !changes) return
    updateSheet((s) => {
      const data = s.data.map((r) => [...r])
      const cache = { ...s.sthaCache }
      for (const [r, c, _old, next] of changes) {
        const cc = typeof c === 'number' ? c : Number(c)
        const val: any = next
        data[r as number][cc] = val === '' ? null : val
        const key = `${r},${cc}`
        if (typeof val !== 'string' || !val.startsWith('=') || !/STHA_/.test(val)) {
          if (cache[key] !== undefined) delete cache[key]
        }
      }
      return { ...s, data, sthaCache: cache }
    })
    setTimeout(() => resolveSthaFor(activeId), 0)
  }

  const resolveSthaFor = async (sheetId: string) => {
    const sheet = wb.sheets.find((s) => s.id === sheetId)
    if (!sheet) return
    const callsByKey: Record<string, { name: string; args: string[]; positions: { r: number; c: number }[] }> = {}
    sheet.data.forEach((row, r) => {
      row.forEach((val, c) => {
        if (typeof val === 'string' && val.startsWith('=') && /STHA_/.test(val)) {
          const calls = extractSthaCalls(val)
          for (const call of calls) {
            const key = `${call.name}|${call.args.join('\u0001')}`
            if (!callsByKey[key]) callsByKey[key] = { ...call, positions: [] }
            callsByKey[key].positions.push({ r, c })
          }
        }
      })
    })
    // include chart series formulas
    const chartCalls: { name: string; args: string[] }[] = []
    for (const obj of sheet.objects ?? []) {
      if (obj.kind === 'chart') {
        for (const s of obj.series) {
          const raw = s.formula.startsWith('=') ? s.formula.slice(1) : s.formula
          const calls = extractSthaCalls('=' + raw)
          for (const call of calls) {
            const key = `${call.name}|${call.args.join('\u0001')}`
            if (!callsByKey[key]) callsByKey[key] = { ...call, positions: [] }
            chartCalls.push(call)
          }
        }
      }
    }
    const distinctCalls = Object.values(callsByKey).map((c) => ({ name: c.name, args: c.args }))
    if (!distinctCalls.length) return
    try {
      const results = await resolve({ data: { calls: distinctCalls } })
      updateSheet((s) => {
        const cache = { ...s.sthaCache }
        for (const [key, entry] of Object.entries(callsByKey)) {
          const res = (results as any)[key]
          if (!res) continue
          for (const { r, c } of entry.positions) {
            cache[`${r},${c}`] = (res.value ?? (res.error ? `#ERRO` : '')) as any
          }
        }
        // update chart cached values
        const objects = (s.objects ?? []).map((obj) => {
          if (obj.kind !== 'chart') return obj
          const values = obj.series.map((series) => {
            const raw = series.formula.startsWith('=') ? series.formula.slice(1) : series.formula
            const calls = extractSthaCalls('=' + raw)
            const first = calls[0]
            if (!first) return null
            const k = `${first.name}|${first.args.join('\u0001')}`
            const r = (results as any)[k]
            const v = r?.value
            return typeof v === 'number' ? v : v == null ? null : Number(v) || 0
          })
          return { ...obj, values }
        })
        return { ...s, sthaCache: cache, objects }
      })
    } catch {
      /* keep cache */
    }
  }

  useEffect(() => { void resolveSthaFor(activeId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeId])

  useImperativeHandle(ref, () => ({
    getWorkbook: () => wb,
    recalcSthaAll: async () => { for (const s of wb.sheets) await resolveSthaFor(s.id) },
    applyStyleToSelection: (patch) => {
      const hot = hotRef.current?.hotInstance
      if (!hot) return
      const sel = hot.getSelected()
      if (!sel) return
      updateSheet((s) => {
        const styles = { ...s.styles }
        for (const [r1, c1, r2, c2] of sel) {
          const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2)
          const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2)
          for (let r = rMin; r <= rMax; r++) {
            for (let c = cMin; c <= cMax; c++) {
              styles[`${r},${c}`] = { ...(styles[`${r},${c}`] ?? {}), ...patch }
            }
          }
        }
        return { ...s, styles }
      })
    },
    insertAtActive: (value: string) => {
      const hot = hotRef.current?.hotInstance
      if (!hot) return
      const sel = hot.getSelectedLast()
      if (!sel) return
      const [r, c] = sel
      updateSheet((s) => {
        const data = s.data.map((row) => [...row])
        while (data.length <= r) data.push(Array.from({ length: DEFAULT_COLS }, () => null))
        for (const row of data) while (row.length <= c) row.push(null)
        data[r][c] = value
        return { ...s, data }
      })
      setTimeout(() => resolveSthaFor(activeId), 0)
    },
    addObject: (obj: SheetObject) => {
      updateSheet((s) => ({ ...s, objects: [...(s.objects ?? []), obj] }))
      if (obj.kind === 'chart') setTimeout(() => resolveSthaFor(activeId), 0)
    },
  }), [wb, activeId])

  const updateObject = (id: string, patch: Partial<SheetObject>) => {
    updateSheet((s) => ({
      ...s,
      objects: (s.objects ?? []).map((o) => (o.id === id ? ({ ...o, ...patch } as SheetObject) : o)),
    }))
  }
  const removeObject = (id: string) => {
    updateSheet((s) => ({ ...s, objects: (s.objects ?? []).filter((o) => o.id !== id) }))
  }

  const addSheet = () => {
    const id = `s${wb.sheets.length + 1}_${Date.now()}`
    const name = `Planilha${wb.sheets.length + 1}`
    const data: (string | number | null)[][] = Array.from({ length: DEFAULT_ROWS }, () =>
      Array.from({ length: DEFAULT_COLS }, () => null),
    )
    const next: Workbook = {
      ...wb,
      sheets: [...wb.sheets, { id, name, data, mergeCells: [], colWidths: [], rowHeights: [], styles: {}, sthaCache: {}, objects: [] }],
      activeSheetId: id,
    }
    setWb(next); setActiveId(id); onChange?.(next)
  }

  const renameSheet = (id: string) => {
    const s = wb.sheets.find((x) => x.id === id)
    if (!s) return
    const name = prompt('Nome da planilha', s.name)
    if (!name) return
    const next = { ...wb, sheets: wb.sheets.map((x) => x.id === id ? { ...x, name } : x) }
    setWb(next); onChange?.(next)
  }

  const removeSheet = (id: string) => {
    if (wb.sheets.length <= 1) return
    if (!confirm('Excluir esta planilha?')) return
    const remaining = wb.sheets.filter((s) => s.id !== id)
    const next: Workbook = { ...wb, sheets: remaining, activeSheetId: remaining[0].id }
    setWb(next); setActiveId(remaining[0].id); onChange?.(next)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden hot-container ht-theme-main relative bg-white">
        <HotTable
          key={`${activeSheet.id}:${activeSheet.name}`}
          ref={hotRef}
          data={displayData}
          colHeaders
          rowHeaders
          rowHeights={activeSheet.rowHeights.length ? (idx) => activeSheet.rowHeights[idx] || 24 : 24}
          colWidths={activeSheet.colWidths.length ? (idx) => activeSheet.colWidths[idx] || 100 : 100}
          mergeCells={activeSheet.mergeCells}
          contextMenu
          manualColumnResize
          manualRowResize
          fillHandle
          undo
          copyPaste
          licenseKey={HANDSONTABLE_LICENSE}
          height={size.h}
          width={size.w}
          stretchH="none"
          afterChange={handleAfterChange}
          cells={cellsFn}
        />
        <SpreadsheetObjectsLayer
          objects={activeSheet.objects ?? []}
          onChange={updateObject}
          onRemove={removeObject}
        />
      </div>
      <div className="flex items-center gap-1 bg-muted border-t px-2 py-1 overflow-x-auto">
        {wb.sheets.map((s) => (
          <div key={s.id} className="flex items-center">
            <button
              type="button"
              onClick={() => setActiveId(s.id)}
              onDoubleClick={() => renameSheet(s.id)}
              className={`text-xs px-3 py-1 rounded ${s.id === activeId ? 'bg-background border' : 'hover:bg-background/60'}`}
            >{s.name}</button>
            {wb.sheets.length > 1 && (
              <button type="button" onClick={() => removeSheet(s.id)} className="text-xs px-1 text-muted-foreground hover:text-destructive">×</button>
            )}
          </div>
        ))}
        <button type="button" onClick={addSheet} className="text-xs px-2 py-1 hover:bg-background/60 rounded">+ Nova</button>
      </div>
    </div>
  )
})
