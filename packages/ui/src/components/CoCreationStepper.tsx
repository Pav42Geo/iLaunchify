'use client'

// Co-creation stage stepper — demo `.stagebar` matched with token classes.
// Presentational: the rendering page supplies real hrefs (a step without an
// href renders as a non-interactive state, never a dead link — nothing is
// hardcoded here). Creator journey: Post a brief → Choose a maker →
// Collaboration room. Partner journey: Opportunity pool → Collaboration room.

import * as React from 'react'
import Link from 'next/link'
import { cn } from '../lib/utils'

export interface CoCreationStep {
  key: string
  label: string
  state: 'done' | 'current' | 'upcoming'
  /** Real destination when the step is navigable from this page. */
  href?: string
}

export function CoCreationStepper({ steps, className }: { steps: CoCreationStep[]; className?: string }) {
  return (
    <nav
      aria-label="Co-creation progress"
      className={cn(
        'flex items-center gap-s-1 overflow-x-auto rounded-xl border border-ink-200 bg-ink-50 px-s-4 py-s-2',
        className,
      )}
    >
      {steps.map((s, i) => {
        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                'flex h-5 w-5 flex-none items-center justify-center rounded-pill text-ui-label tracking-normal',
                s.state === 'done' && 'bg-success-500 text-white',
                s.state === 'current' && 'bg-pink-500 text-white',
                s.state === 'upcoming' && 'bg-ink-200 text-ink-600',
              )}
            >
              {s.state === 'done' ? '✓' : i + 1}
            </span>
            {s.label}
          </>
        )
        const cls = cn(
          'flex items-center gap-s-2 whitespace-nowrap rounded-pill border border-transparent px-s-3 py-s-2 text-ui-caption font-semibold',
          s.state === 'done' && 'text-success-700',
          s.state === 'current' && 'border-pink-200 bg-white text-ink-900 shadow-sm',
          s.state === 'upcoming' && 'text-ink-500',
        )
        return (
          <React.Fragment key={s.key}>
            {s.href ? (
              <Link
                href={s.href}
                aria-current={s.state === 'current' ? 'step' : undefined}
                className={cn(cls, 'transition hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500')}
              >
                {body}
              </Link>
            ) : (
              <span aria-current={s.state === 'current' ? 'step' : undefined} className={cls}>
                {body}
              </span>
            )}
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn('h-0.5 w-5 flex-none', s.state === 'done' ? 'bg-success-500' : 'bg-ink-200')}
              />
            ) : null}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
