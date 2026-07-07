import { Rnd } from 'react-rnd'
import { BlockView } from './BlockView'
import { useEditorStore } from '@/lib/reports/store'
import type { Block } from '@/lib/reports/types'
import { Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react'

interface Props {
  block: Block
  dynamicValues: Record<string, string>
  readOnly?: boolean
}

export function CanvasBlock({ block, dynamicValues, readOnly }: Props) {
  const selectedId = useEditorStore((s) => s.selectedId)
  const select = useEditorStore((s) => s.select)
  const updateBlock = useEditorStore((s) => s.updateBlock)
  const removeBlock = useEditorStore((s) => s.removeBlock)
  const duplicateBlock = useEditorStore((s) => s.duplicateBlock)
  const bringToFront = useEditorStore((s) => s.bringToFront)
  const sendToBack = useEditorStore((s) => s.sendToBack)
  const isSelected = selectedId === block.id

  if (readOnly) {
    return (
      <div style={{
        position: 'absolute', left: block.x, top: block.y, width: block.w, height: block.h,
        zIndex: block.z ?? 0,
      }}>
        <BlockView block={block} dynamicValues={dynamicValues} />
      </div>
    )
  }

  return (
    <Rnd
      size={{ width: block.w, height: block.h }}
      position={{ x: block.x, y: block.y }}
      bounds="parent"
      onDragStop={(_e, d) => updateBlock(block.id, { x: Math.round(d.x), y: Math.round(d.y) })}
      onResizeStop={(_e, _dir, ref, _delta, pos) => updateBlock(block.id, {
        w: Math.round(ref.offsetWidth), h: Math.round(ref.offsetHeight),
        x: Math.round(pos.x), y: Math.round(pos.y),
      })}
      onMouseDown={() => select(block.id)}
      style={{ zIndex: block.z ?? 0 }}
      className={isSelected ? 'ring-2 ring-primary ring-offset-1' : 'hover:ring-1 hover:ring-primary/40'}
    >
      <div className="w-full h-full relative">
        <BlockView block={block} dynamicValues={dynamicValues} />
        {isSelected && (
          <div className="absolute -top-8 left-0 flex gap-1 bg-background border rounded shadow-sm p-1 z-50">
            <button type="button" onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id) }} className="p-1 hover:bg-muted rounded" title="Duplicar"><Copy className="w-3 h-3" /></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); bringToFront(block.id) }} className="p-1 hover:bg-muted rounded" title="Trazer para frente"><ArrowUp className="w-3 h-3" /></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); sendToBack(block.id) }} className="p-1 hover:bg-muted rounded" title="Enviar para trás"><ArrowDown className="w-3 h-3" /></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); removeBlock(block.id) }} className="p-1 hover:bg-muted rounded text-destructive" title="Excluir"><Trash2 className="w-3 h-3" /></button>
          </div>
        )}
      </div>
    </Rnd>
  )
}
