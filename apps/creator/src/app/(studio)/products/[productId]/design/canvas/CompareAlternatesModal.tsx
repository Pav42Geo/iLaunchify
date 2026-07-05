'use client'

// CompareAlternatesModal — versioning v2 §4.3, decision locked 2026-07-05:
// compare = SIDE-BY-SIDE STATIC RENDERS (live dual canvas explicitly deferred).
// Each side renders the alternate's working JSON through a one-shot offscreen
// fabric StaticCanvas → hi-res PNG (dynamic import — fabric needs window; the
// module is already cached from the Stage). Zoom + scroll are synced across
// both panes; "Make this Active" hands off to the promote confirm dialog.
// 3D thumbnails join when packaging-3d can render from JSON (G-phases).

import * as React from 'react'
import { Crown, Loader2, Minus, Plus, X } from 'lucide-react'
import type { AlternateRow } from './alternates-actions'
import { loadAlternateDesignJson } from './actions'
import { alternateDisplayName } from './AlternatesStrip'

async function renderDesignPng(json: unknown, width: number, height: number): Promise<string | null> {
  try {
    const fabric = await import('fabric')
    const el = document.createElement('canvas')
    const c = new fabric.StaticCanvas(el, { width, height, backgroundColor: '#ffffff' })
    try {
      await c.loadFromJSON(json as never)
      c.renderAll()
      return c.toDataURL({ format: 'png', multiplier: 1.5 })
    } finally {
      c.dispose()
    }
  } catch {
    return null
  }
}

function Pane({
  side,
  alternates,
  pickedId,
  onPick,
  render,
  zoom,
  scrollRef,
  onScroll,
  currentActiveId,
  onPromote,
}: {
  side: 'A' | 'B'
  alternates: AlternateRow[]
  pickedId: string | null
  onPick: (id: string) => void
  render: { url: string | null; loading: boolean }
  zoom: number
  scrollRef: React.MutableRefObject<HTMLDivElement | null>
  onScroll: () => void
  currentActiveId: string | null
  onPromote: (id: string) => void
}) {
  const picked = alternates.find((a) => a.id === pickedId) ?? null
  const isActive = picked?.id === currentActiveId
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white">{side}</span>
          <select
            value={pickedId ?? ''}
            onChange={(e) => onPick(e.target.value)}
            className="min-w-0 truncate rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] font-medium text-ink-900 outline-none focus:border-pink-400"
          >
            {alternates.map((a, i) => (
              <option key={a.id} value={a.id}>
                {alternateDisplayName(a, i)}{a.isActiveAlternate ? ' · Active' : ''}
              </option>
            ))}
          </select>
        </div>
        {isActive ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-pink-700">
            <Crown className="h-3 w-3" /> Active
          </span>
        ) : (
          <button
            type="button"
            onClick={() => picked && onPromote(picked.id)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-900 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-black"
          >
            <Crown className="h-3 w-3" /> Make this Active
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto bg-[conic-gradient(#f1f1f3_90deg,#fafafb_0_180deg,#f1f1f3_0_270deg,#fafafb_0)] bg-[length:16px_16px] p-4"
      >
        {render.loading ? (
          <div className="flex h-full items-center justify-center text-ink-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : render.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={render.url}
            alt={`Alternate ${side} preview`}
            style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
            className="mx-auto block rounded border border-ink-200 bg-white shadow-sm"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-center text-[12px] text-ink-400">
            Nothing saved on this design yet.
          </div>
        )}
      </div>
      <div className="border-t border-ink-100 px-3 py-1.5 text-[10.5px] text-ink-400">
        {picked ? `Last edited ${new Date(picked.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
      </div>
    </div>
  )
}

export function CompareAlternatesModal({
  open,
  onClose,
  productId,
  alternates,
  activeDesignId,
  canvasSize,
  livePng,
  onPromote,
}: {
  open: boolean
  onClose: () => void
  productId: string
  alternates: AlternateRow[]
  /** Design on canvas — its side uses the freshest live-canvas PNG when given. */
  activeDesignId: string | null
  /** Offscreen render dimensions — same formula as the Stage (trim+bleed × pxPerMm). */
  canvasSize: { width: number; height: number }
  /** Hi-res PNG of the live canvas grabbed when the modal opened (or null). */
  livePng: string | null
  onPromote: (designId: string) => void
}) {
  const currentActiveId = alternates.find((a) => a.isActiveAlternate)?.id ?? null

  // Default picks: A = the Active sibling, B = the on-canvas design if it's a
  // different one, else the first other sibling.
  const [aId, setAId] = React.useState<string | null>(null)
  const [bId, setBId] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open) return
    const a = currentActiveId ?? alternates[0]?.id ?? null
    const b =
      (activeDesignId && activeDesignId !== a ? activeDesignId : null) ??
      alternates.find((x) => x.id !== a)?.id ??
      null
    setAId(a)
    setBId(b)
  }, [open, currentActiveId, activeDesignId, alternates])

  // Render cache — designId → dataURL (null = rendered empty).
  const [renders, setRenders] = React.useState<Record<string, string | null>>({})
  const [loading, setLoading] = React.useState<Record<string, boolean>>({})
  const ensureRender = React.useCallback(
    async (designId: string | null) => {
      if (!designId || renders[designId] !== undefined || loading[designId]) return
      // The on-canvas design gets the live grab — always freshest.
      if (designId === activeDesignId && livePng) {
        setRenders((r) => ({ ...r, [designId]: livePng }))
        return
      }
      setLoading((l) => ({ ...l, [designId]: true }))
      const json = await loadAlternateDesignJson(productId, designId)
      const url = json == null ? null : await renderDesignPng(json, canvasSize.width, canvasSize.height)
      setRenders((r) => ({ ...r, [designId]: url }))
      setLoading((l) => ({ ...l, [designId]: false }))
    },
    [renders, loading, activeDesignId, livePng, productId, canvasSize],
  )
  React.useEffect(() => {
    if (!open) return
    void ensureRender(aId)
    void ensureRender(bId)
  }, [open, aId, bId, ensureRender])

  // Synced zoom + scroll.
  const [zoom, setZoom] = React.useState(1)
  const aRef = React.useRef<HTMLDivElement | null>(null)
  const bRef = React.useRef<HTMLDivElement | null>(null)
  const syncing = React.useRef(false)
  const mirror = (from: React.MutableRefObject<HTMLDivElement | null>, to: React.MutableRefObject<HTMLDivElement | null>) => () => {
    if (syncing.current) return
    const f = from.current
    const t = to.current
    if (!f || !t) return
    syncing.current = true
    t.scrollLeft = f.scrollLeft
    t.scrollTop = f.scrollTop
    requestAnimationFrame(() => { syncing.current = false })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[92] flex flex-col bg-ink-900/40 p-6" role="dialog" aria-modal="true" aria-label="Compare alternates">
      <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <div className="font-display text-[14px] font-semibold text-ink-900">Compare alternates</div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-ink-200 px-1.5 py-0.5">
              <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="rounded p-1 text-ink-500 hover:bg-ink-100">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[42px] text-center text-[11px] font-semibold text-ink-700">{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} className="rounded p-1 text-ink-500 hover:bg-ink-100">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 divide-x divide-ink-200">
          <Pane
            side="A"
            alternates={alternates}
            pickedId={aId}
            onPick={setAId}
            render={{ url: aId ? renders[aId] ?? null : null, loading: !!(aId && loading[aId]) }}
            zoom={zoom}
            scrollRef={aRef}
            onScroll={mirror(aRef, bRef)}
            currentActiveId={currentActiveId}
            onPromote={onPromote}
          />
          <Pane
            side="B"
            alternates={alternates}
            pickedId={bId}
            onPick={setBId}
            render={{ url: bId ? renders[bId] ?? null : null, loading: !!(bId && loading[bId]) }}
            zoom={zoom}
            scrollRef={bRef}
            onScroll={mirror(bRef, aRef)}
            currentActiveId={currentActiveId}
            onPromote={onPromote}
          />
        </div>

        <footer className="border-t border-ink-100 px-4 py-2 text-[10.5px] text-ink-400">
          Static renders of each alternate’s latest saved state. Zoom and scroll stay in sync — pick the winner with “Make this Active”.
        </footer>
      </div>
    </div>
  )
}
