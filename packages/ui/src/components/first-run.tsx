import * as React from 'react'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * First-run / empty-state primitives (2026-06-26, docs/CREATOR_FIRST_RUN_PROPOSAL.md).
 *
 * Research-backed pieces for turning blank Orders/Products pages + the new-creator
 * Dashboard into activation moments (NN/g, Polaris, Carbon, Appcues, Reforge):
 *   - EmptyState              — the Polaris/Carbon anatomy: icon → positive title →
 *                               body → ONE primary action (+ optional extras).
 *   - GettingStartedChecklist — the launch funnel with endowed-progress prefill +
 *                               a progress bar (Zeigarnik / endowed-progress effect).
 *   - HowItWorksStrip         — the 3-step mental model (Design → Produce → Fulfill).
 *   - StarterTiles            — category quick-starts (intent-first, the Canva lever).
 *
 * All server-safe (no 'use client'), icons passed as ReactNode (no Lucide refs
 * across the RSC boundary), and token-only colors (passes pnpm check:colors).
 * Apps compose their own links so cross-app hrefs (marketingUrl) stay in the app.
 */

// -----------------------------------------------------------------------------
// EmptyState — one positive title, one primary action, no dead ends.
// -----------------------------------------------------------------------------

export function EmptyState({
  icon,
  eyebrow,
  title,
  body,
  actions,
  align = 'left',
  className,
  children,
}: {
  /** Optional leading icon (a node) shown in a tinted ball. */
  icon?: ReactNode
  eyebrow?: string
  title: string
  /** One line: the next step + its benefit. */
  body?: ReactNode
  /** The primary (and at most one secondary) action — caller composes the links. */
  actions?: ReactNode
  align?: 'left' | 'center'
  className?: string
  /** Extra content below (e.g. StarterTiles). */
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-ink-200 bg-white p-6 sm:p-7',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'inline-flex h-11 w-11 items-center justify-center rounded-xl bg-pink-50 text-pink-700',
            align === 'center' && 'mx-auto',
          )}
        >
          {icon}
        </div>
      )}
      {eyebrow && (
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{eyebrow}</p>
      )}
      <h2 className="mt-3 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
        {title}
      </h2>
      {body && (
        <p
          className={cn(
            'mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-ink-600',
            align === 'center' && 'mx-auto',
          )}
        >
          {body}
        </p>
      )}
      {actions && (
        <div className={cn('mt-4 flex flex-wrap items-center gap-3', align === 'center' && 'justify-center')}>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

// -----------------------------------------------------------------------------
// GettingStartedChecklist — the launch funnel (endowed progress + progress bar).
// -----------------------------------------------------------------------------

export interface ChecklistStep {
  label: string
  /** Small muted note after the label. */
  note?: string
  state: 'done' | 'active' | 'locked'
  /** Right-aligned primary action for the ACTIVE step (e.g. a pink pill link). */
  action?: ReactNode
  /** Right-aligned quiet link (e.g. "Personalize" on the done brand step). */
  sideLink?: ReactNode
  /** Shown on locked steps (e.g. "after you design"). */
  lockedHint?: string
}

export function GettingStartedChecklist({
  title = 'Your launch progress',
  steps,
  className,
}: {
  title?: string
  steps: ChecklistStep[]
  className?: string
}) {
  const done = steps.filter((s) => s.state === 'done').length
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-ink-200 bg-white', className)}>
      <div className="px-4 pb-1 pt-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-ink-900">{title}</span>
          <span className="text-[11px] tabular-nums text-ink-500">
            {done} of {steps.length}
          </span>
        </div>
        <div className="mt-2 h-[5px] overflow-hidden rounded-pill bg-ink-100">
          <div className="h-full rounded-pill bg-pink-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="mt-1.5">
        {steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              'flex items-center gap-3 border-t border-ink-100 px-4 py-2.5',
              s.state === 'active' && 'bg-pink-50/60',
            )}
          >
            <span
              className={cn(
                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]',
                s.state === 'done' && 'bg-success-500 text-white',
                s.state === 'active' && 'bg-pink-500 text-white',
                s.state === 'locked' && 'border border-ink-300 text-ink-400',
              )}
              aria-hidden="true"
            >
              {s.state === 'done' ? '✓' : s.state === 'active' ? '●' : '○'}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'text-[13.5px]',
                  s.state === 'done' && 'text-ink-500 line-through',
                  s.state === 'active' && 'font-semibold text-ink-900',
                  s.state === 'locked' && 'text-ink-600',
                )}
              >
                {s.label}
              </span>
              {s.note && <span className="ml-1.5 text-[11px] text-ink-400">· {s.note}</span>}
            </span>
            {s.action && s.state === 'active' && <span className="shrink-0">{s.action}</span>}
            {s.sideLink && s.state !== 'active' && <span className="shrink-0">{s.sideLink}</span>}
            {s.state === 'locked' && s.lockedHint && (
              <span className="shrink-0 text-[11px] text-ink-400">{s.lockedHint}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// -----------------------------------------------------------------------------
// HowItWorksStrip — the 3-step mental model, taught in-context.
// -----------------------------------------------------------------------------

export interface HowItWorksStep {
  icon: ReactNode
  title: string
  sub: string
}

export function HowItWorksStrip({ steps, className }: { steps: HowItWorksStep[]; className?: string }) {
  return (
    <div
      className={cn('grid gap-px overflow-hidden rounded-2xl border border-ink-200 bg-ink-100', className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((s, i) => (
        <div key={i} className="bg-white px-4 py-3.5">
          <span className="text-ink-900">{s.icon}</span>
          <p className="mt-1.5 text-[13px] font-semibold text-ink-900">
            <span className="text-ink-400">{i + 1}</span> · {s.title}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">{s.sub}</p>
        </div>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// StarterTiles — category quick-starts (intent-first; beats a blank "create" wall).
// -----------------------------------------------------------------------------

export interface StarterTile {
  icon: ReactNode
  label: string
  href: string
}

export function StarterTiles({
  label,
  tiles,
  className,
}: {
  label?: string
  tiles: StarterTile[]
  className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-500">{label}</p>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((t, i) => (
          <a
            key={i}
            href={t.href}
            className="rounded-xl border border-ink-200 bg-white px-3 py-3 text-center text-[12px] font-medium text-ink-700 transition-colors hover:border-pink-300 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <span className="inline-flex text-pink-600">{t.icon}</span>
            <span className="mt-1.5 block">{t.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
