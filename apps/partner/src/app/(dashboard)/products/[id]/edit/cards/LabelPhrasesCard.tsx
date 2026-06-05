'use client'

// Label Phrases editor card — 2026-06-05 per-product label-phrase suggestion
// engine. Mirrors NichesAndTagsCard exactly (optimistic toggle + useTransition
// + toast + router.refresh, approval-marked FSM gate, "Why these?" disclosure).
//
// Surfaces:
//   ① Product facts — every PHRASE_FACT_FLAGS flag relevant to this template's
//      labelingType, as a yes/no toggle bound to phraseFacts[key]. Answering a
//      fact feeds the deterministic engine, which auto-attaches the matching
//      regulatory phrases (DSHEA, sunscreen, aerosol, tamper-evident, …).
//   ② Phrases — the engine suggestions grouped by requirement (MANDATORY first,
//      then RECOMMENDED). MANDATORY/locked phrases show a 🔒 "Required" pill and
//      cannot be toggled off; RECOMMENDED phrases are add/remove chips.
//   ③ "Why these?" disclosure — every matched rule (ruleDescription + weight)
//      from the engine's rawHits, so the partner sees the platform's logic.
//
// Phrase + fact edits on a PUBLISHED template flip status → PENDING_EDIT_REVIEW
// (the server actions handle the transition; this UI just refreshes after save).

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Lock, Sparkles } from 'lucide-react'
import type { PhraseSuggestion, PhraseFactFlag } from '@ilaunchify/marketplace'
import { saveProductPhraseFacts, saveProductPhrases } from '../card-actions'

// -----------------------------------------------------------------------------
// Props — phrase suggestions + raw rule hits are computed server-side on initial
// render; the fact flags are filtered to this template's labelingType in page.tsx.
// -----------------------------------------------------------------------------

interface LabelPhrasesCardProps {
  productTemplateId: string
  /** Product labeling regime — drives which fact flags + phrases show. */
  labelingType: string
  /** PHRASE_FACT_FLAGS whose labelingTypes include this template's regime. */
  factFlags: PhraseFactFlag[]
  /** Current yes/no answers — { [factKey]: boolean }. */
  initialFacts: Record<string, boolean>
  /** Engine result computed server-side on initial render. */
  suggestions: PhraseSuggestion[]
  /** Raw rule hits (matched rows) for the "Why these?" disclosure. */
  rawHits: Array<{ ruleId: string; phraseId: string; matched: boolean }>
  /** mandatoryPhraseIds currently linked to this product. */
  selectedPhraseIds: string[]
  isDraft: boolean
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function LabelPhrasesCard({
  productTemplateId,
  labelingType,
  factFlags,
  initialFacts,
  suggestions,
  rawHits,
  selectedPhraseIds,
  isDraft,
}: LabelPhrasesCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Local mirrors so toggles feel instant. Server is source of truth — a
  // failure rolls back the optimistic change.
  const [facts, setFacts] = useState<Record<string, boolean>>(() => ({ ...initialFacts }))
  const [phrases, setPhrases] = useState<Set<string>>(() => new Set(selectedPhraseIds))
  const [showWhy, setShowWhy] = useState(false)

  // -------- Fact toggle --------
  function toggleFact(key: string) {
    const next = { ...facts, [key]: !facts[key] }
    setFacts(next)
    startTransition(async () => {
      const result = await saveProductPhraseFacts(productTemplateId, next)
      if (!result.ok) {
        setFacts({ ...initialFacts })
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  // -------- Phrase toggle --------
  function togglePhrase(phraseId: string, isLocked: boolean) {
    if (isLocked) {
      toast.error("Required for this product — can't be removed")
      return
    }
    const next = new Set(phrases)
    if (next.has(phraseId)) next.delete(phraseId)
    else next.add(phraseId)
    setPhrases(next)
    startTransition(async () => {
      const result = await saveProductPhrases(productTemplateId, Array.from(next))
      if (!result.ok) {
        setPhrases(new Set(selectedPhraseIds))
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  // -------- Group suggestions by requirement (MANDATORY first) --------
  const { mandatory, recommended } = useMemo(() => {
    const m: PhraseSuggestion[] = []
    const r: PhraseSuggestion[] = []
    for (const s of suggestions) {
      if (s.requirement === 'MANDATORY' || s.isLocked) m.push(s)
      else r.push(s)
    }
    return { mandatory: m, recommended: r }
  }, [suggestions])

  // Matched rules for the "Why these?" disclosure — join rawHits back to the
  // suggestion that produced them so we can show ruleDescription + weight.
  const matchedRules = useMemo(() => {
    const byRuleId = new Map<string, PhraseSuggestion>()
    for (const s of suggestions) byRuleId.set(s.ruleId, s)
    const seen = new Set<string>()
    const rows: PhraseSuggestion[] = []
    for (const hit of rawHits) {
      if (!hit.matched) continue
      const s = byRuleId.get(hit.ruleId)
      if (s && !seen.has(s.ruleId)) {
        seen.add(s.ruleId)
        rows.push(s)
      }
    }
    return rows
  }, [rawHits, suggestions])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Section 1 — Product facts */}
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Product facts</h3>
          <p className="text-xs text-zinc-500">{labelingType.replace(/_/g, ' ')}</p>
        </header>
        <p className="mb-3 text-xs text-zinc-500">
          Answer these facts — the platform applies the matching regulatory
          phrases automatically.
        </p>
        {factFlags.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            No product facts apply to this labeling type.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {factFlags.map((flag) => {
              const on = !!facts[flag.key]
              return (
                <li key={flag.key}>
                  <button
                    type="button"
                    onClick={() => toggleFact(flag.key)}
                    disabled={!isDraft || isPending}
                    aria-pressed={on}
                    className={[
                      'flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                      on
                        ? 'border-pink-300 bg-pink-50'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50',
                      !isDraft || isPending ? 'cursor-not-allowed opacity-60' : '',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden
                      className={[
                        'mt-0.5 flex h-4 w-7 flex-shrink-0 items-center rounded-full p-0.5 transition-colors',
                        on ? 'bg-pink-500' : 'bg-zinc-300',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'h-3 w-3 rounded-full bg-white transition-transform',
                          on ? 'translate-x-3' : 'translate-x-0',
                        ].join(' ')}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-zinc-900">
                        {flag.label}
                      </span>
                      <span className="block text-xs text-zinc-500">{flag.help}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Section 2 — Phrases */}
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Label phrases</h3>
          <p className="text-xs text-zinc-500">Regulatory statements for this product</p>
        </header>

        {suggestions.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            No phrases apply yet. Answer the product facts above to trigger
            regulatory statements.
          </p>
        ) : (
          <div className="space-y-3">
            <PhraseGroup
              label="Required"
              phrases={mandatory}
              selected={phrases}
              isDisabled={!isDraft || isPending}
              onToggle={togglePhrase}
            />
            <PhraseGroup
              label="Recommended"
              phrases={recommended}
              selected={phrases}
              isDisabled={!isDraft || isPending}
              onToggle={togglePhrase}
            />
          </div>
        )}

        {/* Why these? disclosure */}
        {matchedRules.length > 0 && (
          <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50">
            <button
              type="button"
              onClick={() => setShowWhy((v) => !v)}
              aria-expanded={showWhy}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:text-zinc-900"
            >
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-pink-500" />
                Why these?
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${
                  showWhy ? 'rotate-180' : ''
                }`}
              />
            </button>
            {showWhy && (
              <ul className="space-y-1.5 border-t border-zinc-200 px-3 py-2 text-xs text-zinc-600">
                {matchedRules.map((s) => (
                  <li key={s.ruleId} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-block min-w-[2.5rem] rounded bg-white px-1 py-0.5 text-center font-mono text-[10px] font-semibold text-zinc-700 ring-1 ring-zinc-200">
                      {s.weight}
                    </span>
                    <span>
                      <span className="font-medium text-zinc-800">{s.title}</span>
                      {' — '}
                      {s.ruleDescription}
                      {s.isLocked && (
                        <span className="ml-1 text-rose-700">(required)</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Footnote — explains the engine + approval-map gating to the partner */}
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Mandatory phrases are auto-attached from your product facts + recipe. The
        creator&apos;s Design Studio will suggest exactly this set and flag any
        required phrase missing from the label. Editing phrases on a published
        product sends the change to admin review (your live listing keeps serving
        until approved).
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Sub-component — one requirement group of phrase chips with a heading.
// MANDATORY/locked phrases render a 🔒 Required pill and reject deselection.
// -----------------------------------------------------------------------------

function PhraseGroup({
  label,
  phrases,
  selected,
  isDisabled,
  onToggle,
}: {
  label: string
  phrases: PhraseSuggestion[]
  selected: Set<string>
  isDisabled: boolean
  onToggle: (phraseId: string, isLocked: boolean) => void
}) {
  if (phrases.length === 0) return null
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </h4>
      <ul className="flex flex-wrap gap-1.5">
        {phrases.map((p) => {
          const isLocked = p.isLocked || p.requirement === 'MANDATORY'
          // Locked phrases are always "on" (force-attached server-side).
          const isSelected = isLocked || selected.has(p.phraseId)
          return (
            <li key={p.phraseId}>
              <button
                type="button"
                onClick={() => onToggle(p.phraseId, isLocked)}
                disabled={isDisabled && !isLocked}
                aria-pressed={isSelected}
                title={p.body}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  isSelected
                    ? 'border-pink-300 bg-pink-50 text-pink-900'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50',
                  isDisabled && !isLocked ? 'cursor-not-allowed opacity-60' : '',
                ].join(' ')}
              >
                <span className="font-medium">{p.title}</span>
                {isLocked && (
                  <span
                    className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800"
                    title="This phrase is required for this product and cannot be removed"
                  >
                    <Lock className="h-2.5 w-2.5" />
                    Required
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
