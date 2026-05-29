'use client'

// ObjectContextMenu — floating dropdown that appears on right-click
// against a Fabric object, and on click of the "More" button in
// ObjectActions (DS-60c).
//
// Shape mirrors Canva / Figma's per-object menu: Copy / Paste /
// Duplicate / Delete / Bring forward / Send backward / Lock / (V2)
// Comment. Hotkey labels render on the right.
//
// Closes on Escape, on outside click, and after any action runs.
// Positioned at given viewport coordinates and clamped to stay inside
// the viewport.

import * as React from 'react'
import {
  Copy as CopyIcon,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Lock,
  Unlock,
  MessageSquare,
} from 'lucide-react'
import {
  duplicateObject,
  removeObject,
  bringForward,
  sendBackwards,
  toggleLock,
  isLocked,
  type FabricCanvas,
  type FabricObject,
} from '@ilaunchify/ui'
import type { ObjectClipboard } from './useObjectClipboard'

interface Props {
  canvas: FabricCanvas | null
  /** Object the menu acts on. Null hides the menu. */
  target: FabricObject | null
  /** Viewport-space x of the click, null = closed. */
  x: number | null
  /** Viewport-space y of the click, null = closed. */
  y: number | null
  clipboard: ObjectClipboard
  onClose: () => void
}

export function ObjectContextMenu({ canvas, target, x, y, clipboard, onClose }: Props) {
  const ref = React.useRef<HTMLDivElement>(null)
  const open = target !== null && x !== null && y !== null

  // Close on outside click + Escape.
  React.useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || !target || !canvas) return null

  const locked = isLocked(target)

  // Clamp to viewport — keeps a 220x340 menu fully visible.
  const menuW = 240
  const menuH = 340
  const left = Math.min(x!, window.innerWidth - menuW - 8)
  const top = Math.min(y!, window.innerHeight - menuH - 8)

  function run(fn: () => unknown) {
    void Promise.resolve(fn()).finally(() => onClose())
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[220px] rounded-lg border border-ink-200 bg-white shadow-xl py-1"
      style={{ left, top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem
        icon={CopyIcon}
        label="Copy"
        hotkey="⌘C"
        onClick={() => run(() => clipboard.copy(target))}
      />
      <MenuItem
        icon={Scissors}
        label="Cut"
        hotkey="⌘X"
        onClick={() => run(() => clipboard.cut(target))}
      />
      <MenuItem
        icon={ClipboardPaste}
        label="Paste"
        hotkey="⌘V"
        disabled={!clipboard.hasContents()}
        onClick={() => run(() => clipboard.paste())}
      />
      <MenuItem
        icon={CopyPlus}
        label="Duplicate"
        hotkey="⌘D"
        onClick={() => run(() => duplicateObject(canvas, target))}
      />
      <MenuItem
        icon={Trash2}
        label="Delete"
        hotkey="Del"
        onClick={() => run(() => removeObject(canvas, target))}
      />
      <Divider />
      <MenuItem
        icon={ArrowUp}
        label="Bring forward"
        hotkey="⌘]"
        onClick={() => run(() => bringForward(canvas, target))}
      />
      <MenuItem
        icon={ArrowDown}
        label="Send backward"
        hotkey="⌘["
        onClick={() => run(() => sendBackwards(canvas, target))}
      />
      <Divider />
      <MenuItem
        icon={locked ? Unlock : Lock}
        label={locked ? 'Unlock' : 'Lock'}
        hotkey="⌥⇧L"
        onClick={() => run(() => toggleLock(canvas, target))}
      />
      <MenuItem
        icon={MessageSquare}
        label="Comment"
        hotkey="⌥⌘N"
        disabled
        onClick={() => onClose()}
      />
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  hotkey,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hotkey?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className={
        'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-[12.5px] text-left transition-colors ' +
        (disabled
          ? 'text-ink-300 cursor-not-allowed'
          : 'text-ink-800 hover:bg-pink-50 hover:text-pink-700')
      }
    >
      <span className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      {hotkey && (
        <span className="text-[10.5px] font-mono text-ink-400 tracking-wider">
          {hotkey}
        </span>
      )}
    </button>
  )
}

function Divider() {
  return <div className="my-1 h-px bg-ink-100" />
}
