'use client'

// AlternatesStrip — versioning v2 §4.3. Sibling design candidates for the slot
// on canvas (flavor × surface), rendered as pills in the Studio top bar next to
// the flavor switcher. The Active sibling (what production/preview/export use)
// carries a pink dot; the pill on canvas is highlighted. Collapses to just the
// "+" button when the slot has a single design (zero clutter for the 90%).
//
// Swapping is a full-reload nav (?alt=<designId>) — same pattern as the flavor
// switcher, so each alternate re-hydrates its own Design + autosave + history.

import * as React from 'react'
import { Plus, MoreVertical, Copy, FilePlus2, Pencil, Trash2, Crown, Columns2, Loader2, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { createAlternate, renameAlternate, deleteAlternate, type AlternateRow } from './alternates-actions'

export function alternateDisplayName(a: AlternateRow, index: number): string {
  if (a.alternateName) return a.alternateName
  return a.isActiveAlternate ? 'Original' : `Draft ${index}`
}

export function AlternatesStrip({
  productId,
  flavorPresetId,
  alternates,
  activeDesignId,
  alternateCap,
  onPromote,
  onCompare,
}: {
  productId: string
  flavorPresetId: string | null
  alternates: AlternateRow[]
  /** The Design on canvas right now (may be a draft sibling). */
  activeDesignId: string | null
  /** Max alternates for the creator's tier; null = unlimited (§4.4). */
  alternateCap: number | null
  /** Opens the promote confirm dialog (decision locked: confirm + snapshot). */
  onPromote: (designId: string) => void
  /** Opens the side-by-side compare modal (needs ≥2 siblings). */
  onCompare: () => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [pillMenuId, setPillMenuId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const atCap = alternateCap !== null && alternates.length >= alternateCap
  const single = alternates.length <= 1

  const swap = (designId: string) => {
    const qs = new URLSearchParams()
    if (flavorPresetId) qs.set('flavor', flavorPresetId)
    qs.set('alt', designId)
    window.location.href = `/products/${productId}/design/canvas?${qs.toString()}`
  }

  const handleCreate = async (mode: 'duplicate' | 'blank') => {
    if (busy) return
    const source = activeDesignId ?? alternates.find((a) => a.isActiveAlternate)?.id ?? alternates[0]?.id
    if (!source) {
      toast.error('Save something on the canvas first — then you can branch an alternate.')
      return
    }
    setBusy(true)
    setMenuOpen(false)
    const res = await createAlternate(source, mode)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(mode === 'duplicate' ? 'Alternate created from the current design' : 'Blank alternate created')
    if (res.designId) swap(res.designId)
  }

  const handleRename = async (a: AlternateRow, index: number) => {
    setPillMenuId(null)
    const name = window.prompt('Name this alternate', alternateDisplayName(a, index))?.trim()
    if (!name) return
    const res = await renameAlternate(a.id, name)
    if (!res.ok) toast.error(res.error)
    else window.location.reload()
  }

  const handleDelete = async (a: AlternateRow, index: number) => {
    setPillMenuId(null)
    if (!window.confirm(`Delete "${alternateDisplayName(a, index)}"? Its history goes with it. Named versions of OTHER alternates are unaffected.`)) return
    const res = await deleteAlternate(a.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('Alternate deleted')
    // Land on the Active sibling.
    const active = alternates.find((x) => x.isActiveAlternate && x.id !== a.id)
    if (active) swap(active.id)
    else window.location.reload()
  }

  return (
    <div className="ml-2 flex items-center gap-1.5 border-l border-ink-200 pl-3">
      {!single &&
        alternates.map((a, i) => {
          const onCanvas = activeDesignId ? a.id === activeDesignId : a.isActiveAlternate
          return (
            <span key={a.id} className="relative">
              <button
                type="button"
                onClick={() => (onCanvas ? setPillMenuId((m) => (m === a.id ? null : a.id)) : swap(a.id))}
                title={
                  a.isActiveAlternate
                    ? 'Active — used for production, preview and export'
                    : `Draft alternate${onCanvas ? ' (on canvas)' : ''}`
                }
                className={`inline-flex max-w-[140px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                  onCanvas
                    ? 'border-success-400 bg-success-50 text-success-700'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50'
                }`}
              >
                {a.isActiveAlternate && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500" title="Active" />}
                <span className="truncate">{alternateDisplayName(a, i)}</span>
                {onCanvas && <MoreVertical className="h-3 w-3 shrink-0 text-ink-400" />}
              </button>

              {pillMenuId === a.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPillMenuId(null)} />
                  <div className="absolute left-0 top-8 z-50 w-48 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-xl">
                    {!a.isActiveAlternate && (
                      <button
                        type="button"
                        onClick={() => { setPillMenuId(null); onPromote(a.id) }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-semibold text-pink-700 hover:bg-pink-50"
                      >
                        <Crown className="h-3.5 w-3.5" /> Make Active…
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleRename(a, i)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-700 hover:bg-ink-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </button>
                    {!a.isActiveAlternate && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(a, i)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-danger-600 hover:bg-danger-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </span>
          )
        })}

      {/* + New alternate */}
      <span className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy}
          title={single ? 'Try another design for this label — keep this one safe' : 'New alternate'}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-300 px-2.5 py-1 text-[11.5px] font-semibold text-ink-500 transition-colors hover:border-pink-400 hover:bg-pink-50 hover:text-pink-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {single ? 'Alternate' : null}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute left-0 top-8 z-50 w-56 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-xl">
              {atCap ? (
                <a
                  href="/settings/plan"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-[12px] text-ink-700 hover:bg-ink-50"
                >
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-600" />
                  <span>
                    <span className="font-semibold">Alternate limit reached</span> ({alternateCap} per label on your plan).
                    <span className="text-pink-700"> Upgrade for more →</span>
                  </span>
                </a>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleCreate('duplicate')}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-700 hover:bg-ink-50"
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicate current design
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreate('blank')}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-700 hover:bg-ink-50"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" /> Start blank
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </span>

      {/* Compare */}
      {!single && (
        <button
          type="button"
          onClick={onCompare}
          title="Compare alternates side by side"
          className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink-600 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700"
        >
          <Columns2 className="h-3 w-3" /> Compare
        </button>
      )}
    </div>
  )
}
