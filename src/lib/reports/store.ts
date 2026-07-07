import { create } from 'zustand'
import type { Block, Canvas, Theme } from './types'

interface EditorState {
  canvas: Canvas
  theme: Theme
  selectedId: string | null
  history: Canvas[]
  future: Canvas[]
  set: (partial: Partial<EditorState>) => void
  setCanvas: (canvas: Canvas, pushHistory?: boolean) => void
  setTheme: (theme: Theme) => void
  select: (id: string | null) => void
  addBlock: (pageIndex: number, block: Block) => void
  updateBlock: (id: string, patch: Partial<Block>) => void
  updateBlockProps: (id: string, props: Record<string, unknown>) => void
  removeBlock: (id: string) => void
  duplicateBlock: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  undo: () => void
  redo: () => void
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

export const useEditorStore = create<EditorState>((set, get) => ({
  canvas: { pages: [{ id: 'p1', blocks: [] }] },
  theme: { primary: '#2563eb', font: 'Inter' },
  selectedId: null,
  history: [],
  future: [],
  set: (partial) => set(partial),
  setCanvas: (canvas, pushHistory = true) => {
    const cur = get().canvas
    if (pushHistory) {
      set({ history: [...get().history.slice(-49), clone(cur)], future: [], canvas })
    } else {
      set({ canvas })
    }
  },
  setTheme: (theme) => set({ theme }),
  select: (id) => set({ selectedId: id }),
  addBlock: (pageIndex, block) => {
    const canvas = clone(get().canvas)
    canvas.pages[pageIndex].blocks.push(block)
    get().setCanvas(canvas)
    set({ selectedId: block.id })
  },
  updateBlock: (id, patch) => {
    const canvas = clone(get().canvas)
    for (const page of canvas.pages) {
      const idx = page.blocks.findIndex((b) => b.id === id)
      if (idx >= 0) {
        page.blocks[idx] = { ...page.blocks[idx], ...patch } as Block
        break
      }
    }
    get().setCanvas(canvas)
  },
  updateBlockProps: (id, props) => {
    const canvas = clone(get().canvas)
    for (const page of canvas.pages) {
      const idx = page.blocks.findIndex((b) => b.id === id)
      if (idx >= 0) {
        const cur = page.blocks[idx] as Block & { props: Record<string, unknown> }
        page.blocks[idx] = { ...cur, props: { ...cur.props, ...props } } as Block
        break
      }
    }
    get().setCanvas(canvas)
  },
  removeBlock: (id) => {
    const canvas = clone(get().canvas)
    for (const page of canvas.pages) {
      page.blocks = page.blocks.filter((b) => b.id !== id)
    }
    get().setCanvas(canvas)
    set({ selectedId: null })
  },
  duplicateBlock: (id) => {
    const canvas = clone(get().canvas)
    for (const page of canvas.pages) {
      const b = page.blocks.find((x) => x.id === id)
      if (b) {
        const nb = { ...clone(b), id: crypto.randomUUID(), x: b.x + 20, y: b.y + 20 }
        page.blocks.push(nb)
        get().setCanvas(canvas)
        set({ selectedId: nb.id })
        break
      }
    }
  },
  bringToFront: (id) => {
    const canvas = clone(get().canvas)
    for (const page of canvas.pages) {
      const max = Math.max(0, ...page.blocks.map((b) => b.z ?? 0))
      const idx = page.blocks.findIndex((b) => b.id === id)
      if (idx >= 0) {
        page.blocks[idx].z = max + 1
        break
      }
    }
    get().setCanvas(canvas)
  },
  sendToBack: (id) => {
    const canvas = clone(get().canvas)
    for (const page of canvas.pages) {
      const min = Math.min(0, ...page.blocks.map((b) => b.z ?? 0))
      const idx = page.blocks.findIndex((b) => b.id === id)
      if (idx >= 0) {
        page.blocks[idx].z = min - 1
        break
      }
    }
    get().setCanvas(canvas)
  },
  undo: () => {
    const { history, canvas, future } = get()
    if (!history.length) return
    const prev = history[history.length - 1]
    set({
      history: history.slice(0, -1),
      future: [clone(canvas), ...future.slice(0, 49)],
      canvas: prev,
    })
  },
  redo: () => {
    const { future, canvas, history } = get()
    if (!future.length) return
    const next = future[0]
    set({
      future: future.slice(1),
      history: [...history.slice(-49), clone(canvas)],
      canvas: next,
    })
  },
}))
