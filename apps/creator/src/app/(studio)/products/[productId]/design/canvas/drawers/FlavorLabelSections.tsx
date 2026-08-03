'use client'

// Per-flavor label safety — Label & Compliance per-flavor list (docs/PER_FLAVOR_LABEL_SAFETY_UX.md).
// Presentational: for a PER_FLAVOR variety pack, shows the creator's SELECTED flavors as a scoped list
// (swatch + name + completeness ✓/"no label yet"; clicking switches the active flavor) plus, when the
// pack carries an aggregate/outer label, a clearly separated aggregate row. Never shows the full
// template pool or other products — the caller passes only the selected subset.

import { Check } from 'lucide-react'

export interface FlavorLabelRow {
  id: string
  name: string
  swatchHex: string | null
  /** Whether this flavor already has a saved label design. */
  hasLabel: boolean
}

export function FlavorLabelSections({
  flavors,
  activeId,
  onSelect,
  aggregate,
}: {
  /** The creator's SELECTED flavors (subset), not the full template pool. */
  flavors: FlavorLabelRow[]
  activeId: string | null
  onSelect: (id: string) => void
  /** Aggregate/outer variety-pack label, when the pack needs one. */
  aggregate?: { required: boolean; saved: boolean; onOpen?: () => void } | null
}) {
  if (flavors.length === 0) return null

  return (
    <div className="space-y-4">
      <section>
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">Per-flavor labels</h4>
        <ul className="space-y-1.5">
          {flavors.map((f) => {
            const active = f.id === activeId
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSelect(f.id)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${
                    active ? 'border-success-500 bg-success-50 ring-1 ring-pink-500' : 'border-ink-200 bg-white hover:border-ink-400'
                  }`}
                >
                  <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-ink-200" style={{ backgroundColor: f.swatchHex ?? 'transparent' }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-900">{f.name}</span>
                  {f.hasLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#B5FF3D]/30 px-2 py-0.5 text-[10.5px] font-semibold text-ink-900">
                      <Check className="h-3 w-3" /> Label
                    </span>
                  ) : (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-500">No label yet</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {aggregate?.required && (
        <section>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">Variety pack label — all flavors</h4>
          <button
            type="button"
            onClick={aggregate.onOpen}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-left hover:border-ink-400"
          >
            <span className="text-[13px] font-medium text-ink-900">Aggregate label</span>
            {aggregate.saved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#B5FF3D]/30 px-2 py-0.5 text-[10.5px] font-semibold text-ink-900">
                <Check className="h-3 w-3" /> Saved
              </span>
            ) : (
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-500">Not created yet</span>
            )}
          </button>
        </section>
      )}
    </div>
  )
}
