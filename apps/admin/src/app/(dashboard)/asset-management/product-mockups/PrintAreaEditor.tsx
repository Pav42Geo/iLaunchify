'use client'

// Draggable 4-corner print-area editor (docs/MOCKUP_STRATEGY.md, Slice 1).
// Admin drags the corners (TL, TR, BR, BL) over the white-label photo to mark
// where a creator's artwork is composited. Coords are image-relative (0..1).

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setMockupPrintArea } from './actions'

type Pt = { x: number; y: number }
const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL']
const DEFAULT: Pt[] = [
  { x: 0.25, y: 0.28 },
  { x: 0.75, y: 0.28 },
  { x: 0.75, y: 0.72 },
  { x: 0.25, y: 0.72 },
]

function normalizeQuad(raw: unknown): Pt[] {
  if (Array.isArray(raw) && raw.length === 4) {
    const out = raw.map((p) => {
      const o = p as { x?: unknown; y?: unknown }
      return { x: clamp(Number(o.x)), y: clamp(Number(o.y)) }
    })
    if (out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return out
  }
  return DEFAULT.map((p) => ({ ...p }))
}
function clamp(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
}

export function PrintAreaEditor({
  mockupId,
  imageUrl,
  initial,
}: {
  mockupId: string
  imageUrl: string
  initial: unknown
}) {
  const [quad, setQuad] = useState<Pt[]>(() => normalizeQuad(initial))
  const [drag, setDrag] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)

  function ptFromEvent(e: React.PointerEvent): Pt | null {
    const box = boxRef.current
    if (!box) return null
    const r = box.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }
  }
  function onMove(e: React.PointerEvent) {
    if (drag === null) return
    const p = ptFromEvent(e)
    if (!p) return
    setQuad((q) => q.map((c, i) => (i === drag ? p : c)))
    setDirty(true)
  }
  function save() {
    start(async () => {
      const res = await setMockupPrintArea(mockupId, quad)
      if (res.ok) { setDirty(false); toast.success('Print area saved') }
      else toast.error(res.error)
    })
  }
  function reset() {
    setQuad(DEFAULT.map((p) => ({ ...p })))
    setDirty(true)
  }

  const points = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')

  return (
    <div className="space-y-2">
      <div
        ref={boxRef}
        className="relative w-full max-w-[420px] select-none overflow-hidden rounded-lg border border-ink-200 bg-ink-50"
        style={{ touchAction: 'none' }}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="block w-full" draggable={false} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={points} fill="rgba(255,46,99,0.18)" stroke="#FF2E63" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        </svg>
        {quad.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Corner ${CORNER_LABELS[i]}`}
            onPointerDown={(e) => { e.preventDefault(); setDrag(i) }}
            className="absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-pink-500 text-[8px] font-bold text-white shadow"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, cursor: 'grab' }}
          >
            {CORNER_LABELS[i]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : dirty ? 'Save print area' : 'Saved'}
        </button>
        <button type="button" onClick={reset} className="text-[12px] font-semibold text-ink-500 hover:text-ink-800">
          Reset
        </button>
        <span className="text-[11px] text-ink-400">Drag corners over the printable region.</span>
      </div>
    </div>
  )
}
