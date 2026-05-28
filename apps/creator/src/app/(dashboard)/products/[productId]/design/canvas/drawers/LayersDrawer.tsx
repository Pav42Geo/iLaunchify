'use client'

// LayersDrawer — Photoshop-style stack of canvas objects.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #11:
//   - One row per canvas object (top-most first)
//   - Visibility eye toggle
//   - Click row to select
//   - Up / down reorder
//   - Trash to delete

import {
  Eye,
  EyeOff,
  Trash2,
  ChevronUp,
  ChevronDown,
  Type as TypeIcon,
  Image as ImageIcon,
  Square,
  Circle,
  Shapes,
  Group,
} from 'lucide-react'
import type { FabricCanvas } from '@ilaunchify/ui'
import { useCanvasObjects, type CanvasObjectRow } from '../useCanvasObjects'

interface Props {
  canvas: FabricCanvas | null
}

export function LayersDrawer({ canvas }: Props) {
  const { rows, setVisible, remove, select, moveUp, moveDown } =
    useCanvasObjects(canvas)

  if (!canvas) {
    return (
      <p className="text-sm text-ink-500">
        Canvas not ready yet — open this drawer once your design loads.
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-6 text-center">
        <Shapes className="mx-auto h-5 w-5 text-ink-400" />
        <h3 className="mt-2 text-sm font-semibold text-ink-900">
          No layers yet
        </h3>
        <p className="mx-auto mt-1.5 max-w-xs text-xs text-ink-500">
          Add text from the Text drawer, drop a logo from Images, or paste in a
          shape to start a stack.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
        {rows.length} layer{rows.length === 1 ? '' : 's'} · top of canvas first
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <LayerRow
            key={row.index}
            row={row}
            isTop={row.index === rows.length - 1}
            isBottom={row.index === 0}
            onToggleVisible={() => setVisible(row.object, !row.visible)}
            onRemove={() => remove(row.object)}
            onSelect={() => select(row.object)}
            onMoveUp={() => moveUp(row.object)}
            onMoveDown={() => moveDown(row.object)}
          />
        ))}
      </ul>
    </div>
  )
}

function LayerRow({
  row,
  isTop,
  isBottom,
  onToggleVisible,
  onRemove,
  onSelect,
  onMoveUp,
  onMoveDown,
}: {
  row: CanvasObjectRow
  isTop: boolean
  isBottom: boolean
  onToggleVisible: () => void
  onRemove: () => void
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const Icon = iconForType(row.type)
  return (
    <li
      className={
        'group flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors ' +
        (row.isActive
          ? 'border-pink-300 bg-pink-50'
          : 'border-ink-200 bg-white hover:border-ink-300')
      }
    >
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={row.visible ? 'Hide layer' : 'Show layer'}
        className="text-ink-500 hover:text-ink-900 transition-colors"
      >
        {row.visible ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5 opacity-50" />
        )}
      </button>

      <button
        type="button"
        onClick={onSelect}
        className={
          'flex-1 text-left flex items-center gap-2 min-w-0 ' +
          (row.visible ? '' : 'opacity-40')
        }
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-ink-500" />
        <span className="text-[12.5px] text-ink-900 truncate">
          {row.preview}
        </span>
      </button>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isTop}
          aria-label="Bring forward"
          className="p-1 rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isBottom}
          aria-label="Send backward"
          className="p-1 rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Delete layer"
          className="p-1 rounded text-ink-500 hover:text-pink-700 hover:bg-pink-50"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </li>
  )
}

function iconForType(type: string): typeof TypeIcon {
  switch (type) {
    case 'i-text':
    case 'text':
    case 'textbox':
      return TypeIcon
    case 'image':
      return ImageIcon
    case 'rect':
      return Square
    case 'circle':
      return Circle
    case 'group':
    case 'activeSelection':
      return Group
    default:
      return Shapes
  }
}
