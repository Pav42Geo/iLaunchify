'use client'

// =============================================================================
// Label-phrase placement panel (admin product review right rail).
// =============================================================================
//
// Mirrors MarketplacePlacementPanel. Renders the deterministic phrase-engine
// suggestions for a ProductTemplate, grouped MANDATORY-first:
//
//   1. Mandatory phrases — locked chips show a non-toggleable "Required" pill
//      (admin + manufacturer cannot remove). Source pill (AUTO/MFG/ADMIN)
//      derived from the most-recent PhraseAssignmentAudit row per phrase.
//   2. Recommended phrases — toggle chips wired to adminSetProductPhrases.
//   3. Why these phrases? — disclosure from rawHits (ruleDescription + weight)
//      so admin can verify the rule engine.
//
// Cream sub-header bar mirrors the v2 admin pattern.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, ScrollText, Workflow, ChevronDown, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@ilaunchify/ui'
import { adminSetProductPhrases } from '../actions'

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

export interface PhraseOption {
  id: string
  slug: string
  title: string
  body: string
  category: string
  requirement: 'MANDATORY' | 'RECOMMENDED'
  cfrCitation: string | null
  appliesWhen: string | null
  /** True = mandatory + cannot be removed (locked by an active phrase rule). */
  isLocked: boolean
}

/** Per-rule breakdown coming from `suggestPhrases.rawHits` + rule meta. */
export interface PhraseRuleHit {
  ruleId: string
  ruleSlug: string
  description: string
  weight: number
  phraseId: string
  phraseTitle: string
  matched: boolean
  isLocked: boolean
}

interface Props {
  productTemplateId: string
  /** Engine-suggested phrases (already deduped by the engine). */
  suggestedPhrases: PhraseOption[]
  /** Phrase ids currently persisted on ProductTemplatePhrase. */
  assignedPhraseIds: string[]
  /** Locked (mandatory) phrase ids — cannot be removed. */
  lockedPhraseIds: string[]
  /** Most-recent PhraseAssignmentAudit source per phrase id → drives the pill. */
  phraseSourceById: Record<string, 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN'>
  ruleHits: PhraseRuleHit[]
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
    AUTO_RULE: { label: 'AUTO', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
    MANUFACTURER: { label: 'MFG', cls: 'border-info-200 bg-info-50 text-info-800' },
    ADMIN: { label: 'ADMIN', cls: 'border-pink-200 bg-pink-50 text-pink-800' },
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
// Chip primitive — toggleable recommended phrases. Locked phrases render a
// rose ring, a "Required" pill, and refuse toggle.
// -----------------------------------------------------------------------------

interface ChipProps {
  label: string
  active: boolean
  locked?: boolean
  lockedReason?: string
  source?: 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN' | null
  disabled?: boolean
  title?: string
  onClick?: () => void
}

function ToggleChip({
  label,
  active,
  locked = false,
  lockedReason,
  source = null,
  disabled = false,
  title,
  onClick,
}: ChipProps) {
  const isInteractive = !locked && !disabled
  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      disabled={!isInteractive}
      title={locked ? lockedReason ?? 'Required by platform rule' : title}
      aria-pressed={active}
      className={cn(
        'group relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium leading-none transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
        locked && 'ring-1 ring-danger-300 ring-offset-1 cursor-not-allowed',
        !isInteractive && !locked && 'cursor-wait opacity-60',
      )}
    >
      <span>{label}</span>
      {locked && (
        <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full border border-danger-200 bg-danger-50 px-1 py-[0px] text-[9px] font-semibold uppercase tracking-wider text-danger-800">
          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
          Required
        </span>
      )}
      <SourcePill source={source} />
    </button>
  )
}

// -----------------------------------------------------------------------------
// Main panel
// -----------------------------------------------------------------------------

export function PhrasePlacementPanel(props: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [phraseIds, setPhraseIds] = useState<Set<string>>(
    () => new Set(props.assignedPhraseIds),
  )

  const lockedSet = new Set(props.lockedPhraseIds)

  function togglePhrase(id: string) {
    if (lockedSet.has(id) && phraseIds.has(id)) {
      toast.error('This phrase is mandatory and cannot be removed')
      return
    }
    const next = new Set(phraseIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const prevIds = phraseIds
    setPhraseIds(next)
    startTransition(async () => {
      const result = await adminSetProductPhrases(
        props.productTemplateId,
        Array.from(next),
      )
      if (!result.ok) {
        toast.error(result.error)
        setPhraseIds(prevIds)
        return
      }
      toast.success('Label phrases updated')
      router.refresh()
    })
  }

  // Group MANDATORY-first.
  const mandatory = props.suggestedPhrases.filter((p) => p.requirement === 'MANDATORY')
  const recommended = props.suggestedPhrases.filter((p) => p.requirement === 'RECOMMENDED')

  const matchedRules = props.ruleHits.filter((r) => r.matched)
  const missedRules = props.ruleHits.filter((r) => !r.matched)

  const renderChip = (p: PhraseOption) => {
    const active = phraseIds.has(p.id)
    const locked = lockedSet.has(p.id)
    const source = active ? props.phraseSourceById[p.id] ?? (locked ? 'AUTO_RULE' : null) : null
    return (
      <ToggleChip
        key={p.id}
        label={p.title}
        active={active}
        locked={locked}
        lockedReason="Mandatory by an active platform rule (manufacturer + admin cannot remove)"
        source={source}
        title={p.appliesWhen ?? p.cfrCitation ?? undefined}
        disabled={isPending}
        onClick={() => togglePhrase(p.id)}
      />
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex items-center gap-2.5 border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-pink-100 text-pink-700">
          <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
          Label phrases
        </h2>
      </header>

      {/* Sub-section 1 — Mandatory phrases */}
      <div className="border-b border-ink-100 px-4 py-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
            Mandatory
          </h3>
          <span className="text-[10.5px] text-ink-500">
            {mandatory.length} required
          </span>
        </div>
        {mandatory.length === 0 ? (
          <p className="text-[11.5px] text-ink-500">
            No mandatory phrases triggered for this product.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">{mandatory.map(renderChip)}</div>
        )}
        <p className="mt-2 text-[10.5px] leading-snug text-ink-500">
          Locked phrases are guaranteed by an active platform rule. ADMIN
          overrides write a PhraseAssignmentAudit row + an AuditLog entry.
        </p>
      </div>

      {/* Sub-section 2 — Recommended phrases */}
      <div className="border-b border-ink-100 px-4 py-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
            Recommended
          </h3>
          <span className="text-[10.5px] text-ink-500">
            {recommended.filter((p) => phraseIds.has(p.id)).length} of{' '}
            {recommended.length} on
          </span>
        </div>
        {recommended.length === 0 ? (
          <p className="text-[11.5px] text-ink-500">
            No recommended phrases suggested for this product.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">{recommended.map(renderChip)}</div>
        )}
      </div>

      {/* Sub-section 3 — Why these phrases? disclosure */}
      <details className="group">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-[12px] text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-inset">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Workflow className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
            Why these phrases?
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
                      ? 'border-success-200 bg-success-50/40'
                      : 'border-ink-100 bg-ink-50/60',
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {r.matched ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success-700" aria-hidden="true" />
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
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-danger-200 bg-danger-50 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider text-danger-800">
                          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                          Locked
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-ink-600">{r.description}</div>
                    <div className="mt-0.5 text-[10.5px] text-ink-500">
                      → <span className="font-medium text-ink-700">{r.phraseTitle}</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 self-center rounded-full border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider',
                      r.matched
                        ? 'border-success-200 bg-success-100 text-success-800'
                        : 'border-ink-200 bg-ink-100 text-ink-600',
                    )}
                  >
                    {r.matched ? 'Matched' : 'Missed'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10.5px] leading-snug text-ink-500">
            Rules are AND across condition rows, OR within values. Edit the
            catalog at <span className="font-mono">/mandatory-phrases</span>.
          </p>
        </div>
      </details>
    </section>
  )
}
