'use client'

// Niches & Tags editor card — Slice 3B of the marketplace taxonomy.
// Per docs/MARKETPLACE_DESIGN.md §2 + memory note
// ilaunchify-marketplace-decisions-2026-06-01.md.
//
// Surfaces:
//   ① Niches strip — every active Niche as a toggleable chip.
//      • Chips that match a rule get an "Auto-suggested" pill.
//      • Chips locked by a rule (e.g. PET_PRODUCT → Pet Wellness) show a
//        "Locked" pill + reject deselection attempts with a toast.
//   ② "Why these suggestions?" disclosure — every matched rule with its
//      description + weight, so the partner sees the platform's logic.
//   ③ Lifestyle, audience, and trend tags — three grouped chip rows
//      (Lifestyle / Audience / Trend) with no locks.
//
// Niche edits on a PUBLISHED template flip status → PENDING_EDIT_REVIEW
// (the server action handles the transition; this UI just refreshes after
// save). Lifestyle tag edits ship live.

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { ChevronDown, Lock, Sparkles } from 'lucide-react'
import type { NicheSuggestion } from '@ilaunchify/marketplace'
import {
  saveProductNiches,
  saveProductLifestyleTags,
} from '../card-actions'

// -----------------------------------------------------------------------------
// Row types — pre-mapped on the server-side loader so we don't pull whole
// Prisma rows into the client bundle.
// -----------------------------------------------------------------------------

export interface NicheOption {
  id: string
  slug: string
  name: string
  iconEmoji: string | null
  accentHex: string | null
}

export interface LifestyleTagOption {
  id: string
  slug: string
  name: string
  group: 'LIFESTYLE' | 'AUDIENCE' | 'TREND'
  iconEmoji: string | null
}

interface NichesAndTagsCardProps {
  productTemplateId: string
  /** Every active Niche row, ordered for display. */
  niches: NicheOption[]
  /** Niche ids currently linked to this product. */
  selectedNicheIds: string[]
  /** Engine result computed server-side on initial render. */
  suggestions: NicheSuggestion[]
  /** Every active LifestyleTag, ordered by group + displayOrder. */
  lifestyleTags: LifestyleTagOption[]
  /** LifestyleTag ids currently linked to this product. */
  selectedTagIds: string[]
  isDraft: boolean
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function NichesAndTagsCard({
  productTemplateId,
  niches,
  selectedNicheIds,
  suggestions,
  lifestyleTags,
  selectedTagIds,
  isDraft,
}: NichesAndTagsCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Local mirrors so chip clicks feel instant. Server is source of truth —
  // a failure rolls back the optimistic toggle.
  const [niches_, setNiches_] = useState<Set<string>>(() => new Set(selectedNicheIds))
  const [tags_, setTags_] = useState<Set<string>>(() => new Set(selectedTagIds))
  const [showWhy, setShowWhy] = useState(false)

  // Index the suggestion engine result for fast lookups.
  const suggestionByNiche = useMemo(() => {
    const map = new Map<string, NicheSuggestion>()
    for (const s of suggestions) map.set(s.nicheId, s)
    return map
  }, [suggestions])

  // -------- Niche toggle --------
  function toggleNiche(nicheId: string, isLocked: boolean) {
    if (isLocked) {
      toast.error('This niche is required for this product type.')
      return
    }
    const next = new Set(niches_)
    if (next.has(nicheId)) next.delete(nicheId)
    else next.add(nicheId)
    setNiches_(next)
    startTransition(async () => {
      const result = await saveProductNiches(productTemplateId, Array.from(next))
      if (!result.ok) {
        // Roll back the optimistic toggle on failure.
        setNiches_(new Set(selectedNicheIds))
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  // -------- Lifestyle tag toggle --------
  function toggleTag(tagId: string) {
    const next = new Set(tags_)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    setTags_(next)
    startTransition(async () => {
      const result = await saveProductLifestyleTags(
        productTemplateId,
        Array.from(next),
      )
      if (!result.ok) {
        setTags_(new Set(selectedTagIds))
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  // -------- Tag group buckets --------
  const tagsByGroup = useMemo(() => {
    const lifestyle: LifestyleTagOption[] = []
    const audience: LifestyleTagOption[] = []
    const trend: LifestyleTagOption[] = []
    for (const t of lifestyleTags) {
      if (t.group === 'LIFESTYLE') lifestyle.push(t)
      else if (t.group === 'AUDIENCE') audience.push(t)
      else trend.push(t)
    }
    return { lifestyle, audience, trend }
  }, [lifestyleTags])

  const matchedSuggestions = suggestions

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Section 1 — Niches */}
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Niches</h3>
          <p className="text-xs text-zinc-500">
            Where this product appears across the marketplace
          </p>
        </header>
        <ul className="flex flex-wrap gap-2">
          {niches.map((n) => {
            const s = suggestionByNiche.get(n.id)
            const isAutoSuggested = !!s
            const isLocked = !!s?.isLocked
            const isSelected = niches_.has(n.id)
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => toggleNiche(n.id, isLocked)}
                  disabled={!isDraft || isPending}
                  aria-pressed={isSelected}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    isSelected
                      ? 'border-pink-300 bg-pink-50 text-pink-900'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50',
                    !isDraft || isPending ? 'cursor-not-allowed opacity-60' : '',
                  ].join(' ')}
                >
                  {n.iconEmoji && (
                    <span aria-hidden className="text-base leading-none">
                      {n.iconEmoji}
                    </span>
                  )}
                  <span className="font-medium">{n.name}</span>
                  {isLocked && (
                    <span
                      className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800"
                      title="This niche is required for this product type and cannot be removed"
                    >
                      <Lock className="h-2.5 w-2.5" />
                      Locked
                    </span>
                  )}
                  {!isLocked && isAutoSuggested && (
                    <span
                      className="ml-0.5 rounded-full bg-pink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pink-700"
                      title="Our auto-suggest engine recommends this niche"
                    >
                      Auto-suggested
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {/* Why these suggestions disclosure */}
        {matchedSuggestions.length > 0 && (
          <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50">
            <button
              type="button"
              onClick={() => setShowWhy((v) => !v)}
              aria-expanded={showWhy}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:text-zinc-900"
            >
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-pink-500" />
                Why these suggestions?
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${
                  showWhy ? 'rotate-180' : ''
                }`}
              />
            </button>
            {showWhy && (
              <ul className="space-y-1.5 border-t border-zinc-200 px-3 py-2 text-xs text-zinc-600">
                {matchedSuggestions.map((s) => (
                  <li key={s.ruleId} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-block min-w-[2.5rem] rounded bg-white px-1 py-0.5 text-center font-mono text-[10px] font-semibold text-zinc-700 ring-1 ring-zinc-200">
                      {s.weight}
                    </span>
                    <span>
                      <span className="font-medium text-zinc-800">{s.nicheName}</span>
                      {' — '}
                      {s.ruleDescription}
                      {s.isLocked && (
                        <span className="ml-1 text-rose-700">(locked rule)</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Section 2 — Lifestyle tags */}
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">
            Lifestyle, audience, and trend tags
          </h3>
          <p className="text-xs text-zinc-500">Multi-select — these power filter chips on the marketplace</p>
        </header>
        <div className="space-y-3">
          <TagGroup
            label="Lifestyle"
            tags={tagsByGroup.lifestyle}
            selected={tags_}
            isDisabled={!isDraft || isPending}
            onToggle={toggleTag}
          />
          <TagGroup
            label="Audience"
            tags={tagsByGroup.audience}
            selected={tags_}
            isDisabled={!isDraft || isPending}
            onToggle={toggleTag}
          />
          <TagGroup
            label="Trend"
            tags={tagsByGroup.trend}
            selected={tags_}
            isDisabled={!isDraft || isPending}
            onToggle={toggleTag}
          />
        </div>
      </section>

      {/* Footnote — explains the approval-map gating to the partner */}
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Editing niches on a published product sends the change to admin
        review (your live listing keeps serving until approved). Lifestyle
        tag changes ship live.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Sub-component — one group of lifestyle-tag chips with a heading.
// -----------------------------------------------------------------------------

function TagGroup({
  label,
  tags,
  selected,
  isDisabled,
  onToggle,
}: {
  label: string
  tags: LifestyleTagOption[]
  selected: Set<string>
  isDisabled: boolean
  onToggle: (id: string) => void
}) {
  if (tags.length === 0) return null
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </h4>
      <ul className="flex flex-wrap gap-1.5">
        {tags.map((t) => {
          const isSelected = selected.has(t.id)
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onToggle(t.id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                className={[
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  isSelected
                    ? 'border-pink-300 bg-pink-50 text-pink-900'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50',
                  isDisabled ? 'cursor-not-allowed opacity-60' : '',
                ].join(' ')}
              >
                {t.iconEmoji && (
                  <span aria-hidden className="text-sm leading-none">
                    {t.iconEmoji}
                  </span>
                )}
                <span>{t.name}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
