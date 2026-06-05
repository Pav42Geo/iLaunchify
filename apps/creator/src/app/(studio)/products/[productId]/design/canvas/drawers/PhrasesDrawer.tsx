'use client'

// Track C — Studio Mandatory Phrases drawer.
//
// DB-driven (admin-managed MandatoryPhrase catalog), filtered to the product's
// labeling type, grouped by category. Click a phrase to drop it on the canvas
// as editable text — bracketed placeholders (net weight, allergen list, …) are
// the creator's to fill. Replaces the old hardcoded phrase chips.

import * as React from 'react'
import { Plus, Loader2, ScrollText, ShieldAlert } from 'lucide-react'
import { addText, type FabricCanvas } from '@ilaunchify/ui'
import { InfoTip } from '../InfoTip'
import { listMandatoryPhrases, type StudioPhrase } from '../phrase-actions'

// FTC enforcement-magnet claims (Made in USA, carbon-neutral, "sustainably
// sourced", biodegradable, dermatologist-tested, …). The admin catalog marks
// these by prefixing the phrase's appliesWhen note with "HIGH-RISK".
function isHighRisk(p: StudioPhrase): boolean {
  return (p.appliesWhen ?? '').toUpperCase().includes('HIGH-RISK')
}

const CAT_ORDER = [
  'ALLERGEN',
  'WARNING',
  'DISCLAIMER',
  'IDENTITY',
  'DIRECTIONS',
  'CLAIM',
  'SUSTAINABILITY',
  'MARKETING',
  'OTHER',
]
const CAT_LABEL: Record<string, string> = {
  ALLERGEN: 'Allergen statements',
  WARNING: 'Warnings',
  DISCLAIMER: 'Disclaimers',
  IDENTITY: 'Identity & net quantity',
  DIRECTIONS: 'Storage & directions',
  CLAIM: 'Claims',
  SUSTAINABILITY: 'Sustainability',
  MARKETING: 'Marketing',
  OTHER: 'Other',
}
const CAT_BADGE: Record<string, string> = {
  ALLERGEN: 'bg-orange-100 text-orange-700',
  WARNING: 'bg-rose-100 text-rose-700',
  DISCLAIMER: 'bg-sky-100 text-sky-700',
  IDENTITY: 'bg-violet-100 text-violet-700',
  DIRECTIONS: 'bg-emerald-100 text-emerald-700',
  CLAIM: 'bg-indigo-100 text-indigo-700',
  SUSTAINABILITY: 'bg-teal-100 text-teal-700',
  MARKETING: 'bg-pink-100 text-pink-700',
  OTHER: 'bg-ink-100 text-ink-600',
}

const REQ_ORDER = ['MANDATORY', 'RECOMMENDED'] as const
const REQ_LABEL: Record<string, string> = {
  MANDATORY: 'Mandatory',
  RECOMMENDED: 'Recommended',
}
const REQ_HINT: Record<string, string> = {
  MANDATORY: 'Required on the label per FDA / regulatory rules for this product type.',
  RECOMMENDED: 'Optional claims, sustainability + marketing language — only if you can substantiate it.',
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
  const [reqFilter, setReqFilter] = React.useState<'ALL' | 'MANDATORY' | 'RECOMMENDED'>('ALL')

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

  const reqGroups = React.useMemo(() => {
    const visible = (phrases ?? []).filter(
      (p) => reqFilter === 'ALL' || (p.requirement || 'MANDATORY') === reqFilter,
    )
    return REQ_ORDER.map((req) => {
      const by = new Map<string, StudioPhrase[]>()
      for (const p of visible) {
        if ((p.requirement || 'MANDATORY') !== req) continue
        by.set(p.category, [...(by.get(p.category) ?? []), p])
      }
      const cats = CAT_ORDER.filter((c) => by.has(c)).map((c) => ({ category: c, items: by.get(c)! }))
      return { requirement: req, cats }
    }).filter((g) => g.cats.length > 0)
  }, [phrases, reqFilter])

  const counts = React.useMemo(() => {
    const list = phrases ?? []
    return {
      ALL: list.length,
      MANDATORY: list.filter((p) => (p.requirement || 'MANDATORY') === 'MANDATORY').length,
      RECOMMENDED: list.filter((p) => (p.requirement || 'MANDATORY') === 'RECOMMENDED').length,
    }
  }, [phrases])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-[12px] leading-[1.45] text-ink-500">
        Label phrases for this product — tap to drop on the label as editable text.
        <InfoTip text="From the admin-managed phrase library, filtered to this product's labeling type. Mandatory = required by FDA/regulatory rules; Recommended = optional claims, sustainability + marketing language. Bracketed placeholders (net weight, allergen list, [N] days…) are yours to fill in. Not legal advice — confirm against your formulation + market." />
      </div>

      {phrases !== null && phrases.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'MANDATORY', 'RECOMMENDED'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReqFilter(r)}
              className={
                'rounded-full px-2.5 py-1 text-[11px] font-medium ' +
                (reqFilter === r
                  ? 'bg-ink-900 text-white'
                  : 'border border-ink-200 text-ink-600 hover:bg-ink-100')
              }
            >
              {r === 'ALL' ? 'All' : REQ_LABEL[r]} ({counts[r]})
            </button>
          ))}
        </div>
      )}

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
      ) : reqGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50/40 px-4 py-6 text-center text-[12px] text-ink-500">
          No {reqFilter === 'MANDATORY' ? 'mandatory' : 'recommended'} phrases for this labeling type.
        </div>
      ) : (
        reqGroups.map((rg) => (
          <div key={rg.requirement} className="space-y-3">
            <div className="flex items-center gap-1.5 border-b border-ink-200 pb-1">
              <span
                className={
                  'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ' +
                  (rg.requirement === 'MANDATORY'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-sky-100 text-sky-700')
                }
              >
                {REQ_LABEL[rg.requirement]}
              </span>
              <InfoTip text={REQ_HINT[rg.requirement] ?? ''} />
            </div>
            {rg.cats.map((g) => (
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12.5px] font-semibold text-ink-900">{p.title}</span>
                          {(p.cfrCitation || p.appliesWhen) && (
                            <InfoTip
                              text={[p.cfrCitation, p.appliesWhen].filter(Boolean).join(' · ')}
                            />
                          )}
                          {isHighRisk(p) && (
                            <span
                              title="FTC enforcement-magnet claim — only use with documentation on file (substantiation, certificate, or test data)."
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-800"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              Substantiation required
                            </span>
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
            ))}
          </div>
        ))
      )}
    </div>
  )
}
