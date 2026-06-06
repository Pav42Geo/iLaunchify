'use client'

// Submit-readiness rail — partner editor sticky sidebar.
//
// Mirrors submitProductForReview()'s server gates (≥1 ingredient slot, ≥1
// packaging system, ≥1 variant) as live checks, plus soft recommendations
// that make a listing actually sellable (name, price, description, hero,
// niche). Clicking a row opens + scrolls to the owning card.
//
// The server stays the source of truth — this rail just stops the partner
// from discovering the gates one rejection toast at a time.

import { CheckCircle2, Circle, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

export interface ReadinessCheck {
  key: string
  label: string
  done: boolean
  /** Required = mirrors a hard server gate; missing blocks Submit. */
  required: boolean
  /** EditorShell card key — clicking the row opens + scrolls to it. */
  cardKey: string
}

export function SubmitReadiness({
  checks,
  onJump,
}: {
  checks: ReadinessCheck[]
  onJump: (cardKey: string) => void
}) {
  const required = checks.filter((c) => c.required)
  const requiredDone = required.filter((c) => c.done).length
  const recommended = checks.filter((c) => !c.required)
  const recommendedDone = recommended.filter((c) => c.done).length
  const ready = requiredDone === required.length
  const pct = Math.round(
    (checks.filter((c) => c.done).length / Math.max(1, checks.length)) * 100,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ready to submit?</CardTitle>
        <CardDescription>
          {ready
            ? recommendedDone === recommended.length
              ? 'Everything checks out.'
              : 'Required items done — recommendations left.'
            : `${required.length - requiredDone} required item${
                required.length - requiredDone === 1 ? '' : 's'
              } left.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Listing completeness"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              ready ? 'bg-emerald-500' : 'bg-amber-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <ul className="space-y-0.5">
          {checks.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => onJump(c.cardKey)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                title="Jump to section"
              >
                {c.done ? (
                  <CheckCircle2
                    className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                ) : c.required ? (
                  <AlertCircle
                    className="h-3.5 w-3.5 flex-shrink-0 text-amber-500"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle className="h-3.5 w-3.5 flex-shrink-0 text-zinc-300" aria-hidden="true" />
                )}
                <span className={c.done ? 'text-zinc-400 line-through' : 'text-zinc-700'}>
                  {c.label}
                </span>
                {c.required && !c.done && (
                  <span className="ml-auto rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                    required
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
