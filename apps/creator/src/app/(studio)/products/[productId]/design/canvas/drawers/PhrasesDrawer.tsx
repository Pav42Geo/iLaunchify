'use client'

// Track C — Studio Mandatory Phrases drawer.
//
// DB-driven (admin-managed MandatoryPhrase catalog), filtered to the product's
// labeling type, grouped by category. Click a phrase to drop it on the canvas
// as editable text — bracketed placeholders (net weight, allergen list, …) are
// the creator's to fill. Replaces the old hardcoded phrase chips.

import * as React from 'react'
import { Plus, Loader2, ScrollText } from 'lucide-react'
import { addText, type FabricCanvas } from '@ilaunchify/ui'
import { InfoTip } from '../InfoTip'
import { listMandatoryPhrases, type StudioPhrase } from '../phrase-actions'

const CAT_ORDER = ['ALLERGEN', 'WARNING', 'DISCLAIMER', 'DIRECTIONS', 'IDENTITY', 'OTHER']
const CAT_LABEL: Record<string, string> = {
  ALLERGEN: 'Allergen statements',
  WARNING: 'Warnings',
  DISCLAIMER: 'Disclaimers',
  DIRECTIONS: 'Storage & directions',
  IDENTITY: 'Identity & net quantity',
  OTHER: 'Other',
}
const CAT_BADGE: Record<string, string> = {
  ALLERGEN: 'bg-orange-100 text-orange-700',
  WARNING: 'bg-rose-100 text-rose-700',
  DISCLAIMER: 'bg-sky-100 text-sky-700',
  DIRECTIONS: 'bg-emerald-100 text-emerald-700',
  IDENTITY: 'bg-violet-100 text-violet-700',
  OTHER: 'bg-ink-100 text-ink-600',
}

export function PhrasesDrawer({
  canvas,
  labelingType,
}: {
  canvas: FabricCanvas | null
  labelingType: string
}) {
  const [phrases, setPhrases] = React.useState<StudioPhrase[] | null>(null)
  const [adding, setAdding] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    setPhrases(null)
    listMandatoryPhrases(labelingType).then((r) => {
      if (alive) setPhrases(r)
    })
    return () => {
      alive = false
    }
  }, [labelingType])

  async function add(p: StudioPhrase) {
    if (!canvas) return
    setAdding(p.id)
    try {
      addText(canvas, p.body, { fontSize: 11, fill: '#0F1116', width: 320 })
    } finally {
      setAdding(null)
    }
  }

  const groups = React.useMemo(() => {
    const by = new Map<string, StudioPhrase[]>()
    for (const p of phrases ?? []) by.set(p.category, [...(by.get(p.category) ?? []), p])
    return CAT_ORDER.filter((c) => by.has(c)).map((c) => ({ category: c, items: by.get(c)! }))
  }, [phrases])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-[12px] leading-[1.45] text-ink-500">
        Required statements for this product — tap to drop on the label as editable text.
        <InfoTip text="From the admin-managed mandatory-phrase catalog, filtered to this product's labeling type. Bracketed placeholders (net weight, allergen list, [N] days…) are yours to fill in. Not legal advice — confirm against your formulation + market." />
      </div>

      {phrases === null ? (
        <div className="flex items-center gap-2 text-[12px] text-ink-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading phrases…
        </div>
      ) : phrases.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-ink-300 bg-ink-50/40 px-4 py-8 text-center">
          <ScrollText className="h-4 w-4 text-ink-400" />
          <p className="text-[12px] text-ink-500">
            No mandatory phrases catalogued for this labeling type yet.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.category}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${CAT_BADGE[g.category] ?? CAT_BADGE.OTHER}`}
              >
                {CAT_LABEL[g.category] ?? g.category}
              </span>
            </div>
            <ul className="space-y-1.5">
              {g.items.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold text-ink-900">{p.title}</span>
                      {(p.cfrCitation || p.appliesWhen) && (
                        <InfoTip
                          text={[p.cfrCitation, p.appliesWhen].filter(Boolean).join(' · ')}
                        />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-3 text-[11px] leading-[1.4] text-ink-500">
                      {p.body}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => add(p)}
                    disabled={!canvas || adding === p.id}
                    title="Add to label"
                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-ink-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-black disabled:opacity-40"
                  >
                    {adding === p.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
