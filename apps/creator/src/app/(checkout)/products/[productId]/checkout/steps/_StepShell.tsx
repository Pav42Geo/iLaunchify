'use client'

// Shared chrome for every wizard step — keeps the headline / sub copy / body
// padding consistent across G2-G7 implementations.

import { type ReactNode } from 'react'
import { WIZARD_STEPS } from '../types'

interface Props {
  index: number
  title: string
  subtitle?: string
  children?: ReactNode
}

export function StepShell({ index, title, subtitle, children }: Props) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-7 shadow-sm">
      <p className="text-[10.5px] font-semibold uppercase tracking-widest text-pink-600">
        Step {index} of {WIZARD_STEPS.length}
      </p>
      <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900">
        {title}
      </h1>
      {subtitle && <p className="mt-1.5 text-sm text-ink-600">{subtitle}</p>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  )
}

export function PlaceholderBody({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-6 text-sm text-ink-600">
      {children}
    </div>
  )
}
