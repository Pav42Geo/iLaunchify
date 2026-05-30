// REBUILD R16.c — promotion-criteria progress card.
//
// Pure server component, no client state. Renders the criteria the admin
// (and eventually the partner) needs to glance at to decide whether to
// promote. Status badges use the same green/amber/grey palette as the
// rest of the admin module.
//
// "Unknown" rows are styled as a soft grey hint with a caveat under the
// row — surfacing what's coming so admin doesn't expect this metric to
// drive a decision yet.

import { CheckCircle2, Circle, AlertCircle, HelpCircle } from 'lucide-react'
import type {
  CriterionStatus,
  PromotionCriteriaResult,
} from './promotion-criteria'

interface Props {
  result: PromotionCriteriaResult
}

const NEXT_TIER_LABEL: Record<'TRUSTED' | 'PREMIER', string> = {
  TRUSTED: 'Trusted',
  PREMIER: 'Premier',
}

export function PromotionCriteriaCard({ result }: Props) {
  // Already at top tier → soft empty state. Don't render the card at all
  // would also be valid; surfacing "no next tier" is nicer for admin
  // because it confirms the page is intentionally minimal here.
  if (result.nextTier == null) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          Promotion criteria
        </h2>
        <p className="mt-2 text-[13px] text-zinc-600">
          This partner is already at the top tier. No promotion criteria to
          evaluate.
        </p>
      </section>
    )
  }

  const allMet =
    result.trackedCount > 0 && result.metCount === result.trackedCount

  return (
    <section
      className="rounded-xl border border-zinc-200 bg-white"
      aria-labelledby="promotion-criteria-heading"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3">
        <div>
          <h2
            id="promotion-criteria-heading"
            className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500"
          >
            Promotion criteria → {NEXT_TIER_LABEL[result.nextTier]}
          </h2>
          <p className="mt-0.5 text-[11.5px] text-zinc-500">
            Decision support only — promotion remains a human call.
          </p>
        </div>
        <span
          className={
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em] ' +
            (allMet
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-zinc-100 text-zinc-700')
          }
        >
          {result.metCount} / {result.trackedCount} tracked met
        </span>
      </header>

      <ul className="divide-y divide-zinc-100">
        {result.criteria.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-start gap-3 px-5 py-3">
            <StatusGlyph status={c.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-zinc-800">{c.label}</p>
                <p
                  className={
                    'text-[12px] tabular-nums ' +
                    (c.status === 'met'
                      ? 'text-emerald-700'
                      : c.status === 'far'
                        ? 'text-zinc-500'
                        : c.status === 'unknown'
                          ? 'text-zinc-400'
                          : 'text-amber-700')
                  }
                >
                  <span className="font-semibold">{c.currentDisplay}</span>
                  <span className="ml-2 text-zinc-400">target {c.targetDisplay}</span>
                </p>
              </div>
              {c.caveat && (
                <p className="mt-1 text-[11.5px] italic text-zinc-500">
                  {c.caveat}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function StatusGlyph({ status }: { status: CriterionStatus }) {
  if (status === 'met') {
    return (
      <CheckCircle2
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600"
        aria-label="Met"
      />
    )
  }
  if (status === 'almost') {
    return (
      <AlertCircle
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600"
        aria-label="Almost met"
      />
    )
  }
  if (status === 'unknown') {
    return (
      <HelpCircle
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400"
        aria-label="Not tracked yet"
      />
    )
  }
  return (
    <Circle
      className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-300"
      aria-label="Not met"
    />
  )
}
