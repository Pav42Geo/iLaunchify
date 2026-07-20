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

import type { ReactNode, Dispatch, SetStateAction } from 'react'

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

/** The co-creation stepper chrome (.stagebar). `setV` is the useState dispatch so the
 *  Next button can use a functional update. */
export function StageBar({ stages, v, setV }: { stages: readonly string[]; v: number; setV: Dispatch<SetStateAction<number>> }) {
  return (
    <div className="flex items-center gap-[5px] overflow-x-auto rounded-t-2xl border border-ink-200 bg-ink-50 px-5 py-[11px]">
      {stages.map((label, i) => {
        const st = i < v ? 'done' : i === v ? 'on' : ''
        return (
          <div key={label} className="flex items-center gap-[5px]">
            <button
              type="button"
              onClick={() => setV(i)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-pill border px-[13px] py-[7px] text-[12.5px] font-semibold transition ${st === 'on' ? 'border-pink-200 bg-white text-ink-900 shadow-sm' : st === 'done' ? 'border-transparent text-success-700' : 'border-transparent text-ink-500'}`}
            >
              <span className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-extrabold ${st === 'on' ? 'bg-pink-500 text-white' : st === 'done' ? 'bg-success-500 text-white' : 'bg-ink-200 text-ink-600'}`}>{i < v ? '✓' : i + 1}</span>
              {label}
            </button>
            {i < stages.length - 1 && <span className={`h-0.5 w-5 flex-none ${i < v ? 'bg-success-500' : 'bg-ink-200'}`} />}
          </div>
        )
      })}
      <span className="flex-1" />
      <button type="button" onClick={() => setV((x) => Math.min(stages.length - 1, x + 1))} disabled={v >= stages.length - 1} className="rounded-pill bg-ink-900 px-4 py-[9px] text-[12.5px] font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">Next stage →</button>
    </div>
  )
}
