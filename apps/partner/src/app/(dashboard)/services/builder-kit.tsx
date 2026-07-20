'use client'

// Shared primitives for the three partner service builders (co-pack, print,
// manufacturing). Extracted 2026-07-20 as PURE DRY: each export below is byte-identical
// (in rendered markup) to the local copies it replaces, so there is zero visual change.
//
// Builder-SPECIFIC pieces stay LOCAL to each builder because they genuinely diverge:
//   • Card    — print/co-pack take sub/tag; manufacturing is title-only (different markup)
//   • Chips   — manufacturing/co-pack are Set-based; print is array-based (different APIs)
//   • Note / Callout / Dflt / DarkF / Toggle / Row / RevRow / Stat — per-builder variants
// Only add something here once it is identical across at least two builders.

import type { ReactNode } from 'react'
import type { CoCreationStep } from '@ilaunchify/ui'

// The service builders use the SAME stepper the Co-Creation Studio uses (the one in the
// briefs): full-bleed, hugging the sidebar, sitting right under the header. Re-exported so
// all three builders pull it from one place. onStepClick drives client-side step nav.
export { CoCreationStepper } from '@ilaunchify/ui'

/** Map builder stages + current index to CoCreationStepper steps. */
export function builderSteps(stages: readonly string[], v: number): CoCreationStep[] {
  return stages.map((label, i) => ({ key: label, label, state: i < v ? 'done' : i === v ? 'current' : 'upcoming' }))
}

export const inputCls =
  'h-[38px] w-full rounded-md border border-ink-300 bg-white px-[11px] text-[13.5px] text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'
export const selectCls =
  'h-[38px] w-full rounded-md border border-ink-300 bg-white px-2 text-[13px] text-ink-900 focus:border-pink-500 focus:outline-none'

/** Uppercase label + optional hint wrapping a field control. */
export function F({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.05em] text-ink-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-ink-400">{hint}</span>}
    </label>
  )
}

/** Step hero: eyebrow + title + description, then optional body. Co-pack calls it without
 *  children (renders just the header); a fragment + undefined child adds no DOM, so the
 *  output matches its old children-less Hero exactly. */
export function Hero({ eyebrow, title, desc, children }: { eyebrow: string; title: string; desc: string; children?: ReactNode }) {
  return (
    <>
      <div className="mb-3.5 rounded-2xl border border-ink-200 bg-white px-[22px] py-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-pink-700">{eyebrow}</div>
        <h1 className="mt-[5px] font-display text-[22px] font-extrabold tracking-[-0.02em] text-ink-900">{title}</h1>
        <p className="mt-1 max-w-[780px] text-[13.5px] text-ink-500">{desc}</p>
      </div>
      {children}
    </>
  )
}

