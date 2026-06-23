'use client'

// =============================================================================
// Slice 3C — Marketplace placement panel (admin product review right rail).
// =============================================================================
//
// Renders ABOVE the existing Partner Constraints panel on /admin/products/[id].
//
// Three sub-sections:
//   1. Niches — 8 toggleable chips with source pills (AUTO / MFG / ADMIN),
//      small pink "auto-suggested" dot when the engine matched, locked-by-rule
//      chips show a rose ring + tooltip + are not toggleable.
//   2. Lifestyle tags — same chip layout, grouped Lifestyle / Audience / Trend.
//   3. Why these niches? — disclosure with the suggestNiches rawHits + matched
//      rules so admin can verify the rule engine is doing what they expect.
//
// Cream sub-header bar mirrors the v2 admin pattern (see Partner Constraints
// panel header on the same page).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Sparkles, Workflow, ChevronDown, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@ilaunchify/ui'
import {
  adminSetProductNiches,
  adminSetProductLifestyleTags,
} from '../actions'

// -----------------------------------------------------------------------------
// Props
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

/** Most-recent audit row per niche — drives the source pill. */
export interface NicheAuditSnapshot {
  nicheId: string
  source: 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN'
}

/** Per-rule breakdown coming from `suggestNiches.rawHits` + matched-rule meta. */
export interface RuleHit {
  ruleId: string
  ruleSlug: string
  description: string
  weight: number
  nicheId: string
  nicheName: string
  matched: boolean
  isLocked: boolean
}

interface Props {
  productTemplateId: string
  allNiches: NicheOption[]
  allLifestyleTags: LifestyleTagOption[]
  assignedNicheIds: string[]
  assignedLifestyleTagIds: string[]
  lifestyleTagSourceById: Record<string, 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN'>
  nicheAuditByNicheId: Record<string, NicheAuditSnapshot>
  suggestedNicheIds: string[]
  lockedNicheIds: string[]
  ruleHits: RuleHit[]
}

// -----------------------------------------------------------------------------
// Source pill (AUTO / MFG / ADMIN). Three tones — gray / sky / pink.
// -----------------------------------------------------------------------------

function SourcePill({
  source,
}: {
  source: 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN' | null
}) {
  if (!source) return null
  const map = {
    AUTO_RULE: {
      label: 'AUTO',
      cls: 'border-ink-200 bg-zinc-100 text-ink-700',
    },
    MANUFACTURER: {
      label: 'MFG',
      cls: 'border-sky-200 bg-sky-50 text-sky-800',
    },
    ADMIN: {
      label: 'ADMIN',
      cls: 'border-pink-200 bg-pink-50 text-pink-800',
    },
  } as const
  const tone = map[source]
  return (
    <span
      className={cn(
        'ml-1 inline-flex items-center rounded-full border px-1 py-[0px] text-[9px] font-semibold uppercase tracking-wider',
        tone.cls,
      )}
    >
      {tone.label}
    </span>
  )
}

// -----------------------------------------------------------------------------
// Chip primitive — used for both niches + lifestyle tags. Same shape so the
// two sub-sections stay visually consistent. Locked chips render a rose ring,
// a Lock icon, and refuse toggle.
// -----------------------------------------------------------------------------

interface ChipProps {
  label: string
  iconEmoji?: string | null
  active: boolean
  locked?: boolean
  lockedReason?: string
  autoSuggested?: boolean
  source?: 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN' | null
  disabled?: boolean
  onClick?: () => void
}

function ToggleChip({
  label,
  iconEmoji,
  active,
  locked = false,
  lockedReason,
  autoSuggested = false,
  source = null,
  disabled = false,
  onClick,
}: ChipProps) {
  const isInteractive = !locked && !disabled
  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      disabled={!isInteractive}
      title={locked ? lockedReason ?? 'Locked by platform rule' : undefined}
      aria-pressed={active}
      className={cn(
        'group relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium leading-none transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
        locked && 'ring-1 ring-rose-300 ring-offset-1 cursor-not-allowed',
        !isInteractive && !locked && 'cursor-wait opacity-60',
      )}
    >
      {iconEmoji && <span aria-hidden="true">{iconEmoji}</span>}
      <span>{label}</span>
      {locked && <Lock className="ml-0.5 h-3 w-3" aria-hidden="true" />}
      {autoSuggested && !locked && (
        <span
          className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-pink-500"
          aria-label="Auto-suggested by rule engine"
          title="Auto-suggested by rule engine"
        />
      )}
      <SourcePill source={source} />
    </button>
  )
}

// -----------------------------------------------------------------------------
// Main panel
// -----------------------------------------------------------------------------

export function MarketplacePlacementPanel(props: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [nicheIds, setNicheIds] = useState<Set<string>>(
    () => new Set(props.assignedNicheIds),
  )
  const [tagIds, setTagIds] = useState<Set<string>>(
    () => new Set(props.assignedLifestyleTagIds),
  )

  const lockedSet = new Set(props.lockedNicheIds)
  const suggestedSet = new Set(props.suggestedNicheIds)

  function toggleNiche(id: string) {
    if (lockedSet.has(id) && nicheIds.has(id)) {
      toast.error('This niche is locked by a platform rule and cannot be removed')
      return
    }
    const next = new Set(nicheIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const prevIds = nicheIds
    setNicheIds(next)
    startTransition(async () => {
      const result = await adminSetProductNiches(
        props.productTemplateId,
        Array.from(next),
      )
      if (!result.ok) {
        toast.error(result.error)
        setNicheIds(prevIds)
        return
      }
      toast.success('Niches updated')
      router.refresh()
    })
  }

  function toggleTag(id: string) {
    const next = new Set(tagIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const prevIds = tagIds
    setTagIds(next)
    startTransition(async () => {
      const result = await adminSetProductLifestyleTags(
        props.productTemplateId,
        Array.from(next),
      )
      if (!result.ok) {
        toast.error(result.error)
        setTagIds(prevIds)
        return
      }
      toast.success('Lifestyle tags updated')
      router.refresh()
    })
  }

  // Group tags by group bucket for the second sub-section.
  const tagsByGroup: Record<'LIFESTYLE' | 'AUDIENCE' | 'TREND', LifestyleTagOption[]> = {
    LIFESTYLE: [],
    AUDIENCE: [],
    TREND: [],
  }
  for (const t of props.allLifestyleTags) tagsByGroup[t.group].push(t)

  const GROUP_LABELS: Record<keyof typeof tagsByGroup, string> = {
    LIFESTYLE: 'Lifestyle',
    AUDIENCE: 'Audience',
    TREND: 'Trend',
  }

  const matchedRules = props.ruleHits.filter((r) => r.matched)
  const missedRules = props.ruleHits.filter((r) => !r.matched)

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex items-center gap-2.5 border-b border-ink-100 bg-cream px-4 py-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-pink-100 text-pink-700">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
          Marketplace placement
        </h2>
      </header>

      {/* Sub-section 1 — Niches */}
      <div className="border-b border-ink-100 px-4 py-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
            Niches
          </h3>
          <span className="text-[10.5px] text-ink-500">
            {nicheIds.size} of {props.allNiches.length} assigned
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {props.allNiches.map((n) => {
            const active = nicheIds.has(n.id)
            const locked = lockedSet.has(n.id)
            const audit = props.nicheAuditByNicheId[n.id]
            // Source pill: ADMIN/MFG from audit when assigned; AUTO when
            // matched by rule engine even if not yet pinned/audited.
            const source: 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN' | null =
              audit?.source ?? (active && suggestedSet.has(n.id) ? 'AUTO_RULE' : null)
            return (
              <ToggleChip
                key={n.id}
                label={n.name}
                iconEmoji={n.iconEmoji}
                active={active}
                locked={locked}
                lockedReason="Locked by an active platform rule (manufacturer + admin cannot remove)"
                autoSuggested={!active && suggestedSet.has(n.id)}
                source={source}
                disabled={isPending}
                onClick={() => toggleNiche(n.id)}
              />
            )
          })}
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-ink-500">
          ADMIN overrides write a NicheAssignmentAudit row + an AuditLog entry.
          Locked chips are guaranteed by a platform rule.
        </p>
      </div>

      {/* Sub-section 2 — Lifestyle tags */}
      <div className="border-b border-ink-100 px-4 py-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
            Lifestyle tags
          </h3>
          <span className="text-[10.5px] text-ink-500">
            {tagIds.size} assigned
          </span>
        </div>
        <div className="space-y-2.5">
          {(Object.keys(tagsByGroup) as Array<keyof typeof tagsByGroup>).map((g) => {
            const tags = tagsByGroup[g]
            if (tags.length === 0) return null
            return (
              <div key={g}>
                <div className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">
                  {GROUP_LABELS[g]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => {
                    const active = tagIds.has(t.id)
                    const source = active
                      ? props.lifestyleTagSourceById[t.id] ?? null
                      : null
                    return (
                      <ToggleChip
                        key={t.id}
                        label={t.name}
                        iconEmoji={t.iconEmoji}
                        active={active}
                        source={source}
                        disabled={isPending}
                        onClick={() => toggleTag(t.id)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sub-section 3 — Why these niches? disclosure */}
      <details className="group">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-[12px] text-ink-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-inset">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Workflow className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
            Auto-suggest analysis
            <span className="text-[10.5px] font-normal text-ink-500">
              · {matchedRules.length} matched · {missedRules.length} skipped
            </span>
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 text-ink-500 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-ink-100 px-4 py-3">
          {props.ruleHits.length === 0 ? (
            <p className="text-[11.5px] text-ink-500">
              No active rules — nothing to evaluate.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {props.ruleHits.map((r) => (
                <li
                  key={r.ruleId}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px]',
                    r.matched
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-ink-100 bg-zinc-50/60',
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {r.matched ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10.5px] tabular-nums text-ink-500">
                        w{r.weight}
                      </span>
                      <span className="font-medium text-ink-900">{r.ruleSlug}</span>
                      {r.isLocked && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider text-rose-800">
                          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                          Locked
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-ink-600">{r.description}</div>
                    <div className="mt-0.5 text-[10.5px] text-ink-500">
                      → <span className="font-medium text-ink-700">{r.nicheName}</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 self-center rounded-full border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider',
                      r.matched
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                        : 'border-ink-200 bg-zinc-100 text-ink-600',
                    )}
                  >
                    {r.matched ? 'Matched' : 'Missed'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10.5px] leading-snug text-ink-500">
            Rules are AND across condition rows, OR within values. Edit the engine
            at <span className="font-mono">/niches/rules</span>.
          </p>
        </div>
      </details>
    </section>
  )
}
