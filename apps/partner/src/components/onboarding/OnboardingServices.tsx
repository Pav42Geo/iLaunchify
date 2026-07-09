'use client'

// Shared "which services are assigned" state for onboarding (Pavel 2026-07-09).
//
// The service cards stay uniform pink. Instead, selecting a service lights up its
// matching pill in the dark appbar — a persistent, color-coded indicator you can
// see while scrolling any step. The header lives in the layout and the picker
// lives deep in the page, so they share a tiny context: the layout seeds it from
// the partner's persisted services, and the business step syncs it live as the
// user toggles.

import { createContext, useContext, useState, type ReactNode } from 'react'

export type ServiceKey = 'MANUFACTURING' | 'COPACKING' | 'LABEL_PRINTING' | 'WAREHOUSE'

// Order + short labels + exact mockup colors (Produce/Pack/Print/Fulfill).
export const SERVICE_PILLS: { key: ServiceKey; label: string; color: string }[] = [
  { key: 'MANUFACTURING', label: 'Produce', color: '#FF2E63' },
  { key: 'COPACKING', label: 'Pack', color: '#7A5AF8' },
  { key: 'LABEL_PRINTING', label: 'Print', color: '#0EA5E9' },
  { key: 'WAREHOUSE', label: 'Fulfill', color: '#12B76A' },
]

type Ctx = { selected: string[]; setSelected: (s: string[]) => void }
const OnboardingServicesContext = createContext<Ctx | null>(null)

export function OnboardingServicesProvider({
  initial,
  children,
}: {
  initial: string[]
  children: ReactNode
}) {
  const [selected, setSelected] = useState<string[]>(initial)
  return (
    <OnboardingServicesContext.Provider value={{ selected, setSelected }}>
      {children}
    </OnboardingServicesContext.Provider>
  )
}

/** Safe outside a provider (returns a no-op) so the picker never crashes. */
export function useOnboardingServices(): Ctx {
  return useContext(OnboardingServicesContext) ?? { selected: [], setSelected: () => {} }
}

// Header indicator — all four pills, each lit in its color when assigned.
export function HeaderServicePills() {
  const { selected } = useOnboardingServices()
  return (
    <div className="ml-auto flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-ink-400">Services:</span>
      {SERVICE_PILLS.map((p) => {
        const on = selected.includes(p.key)
        return (
          <span
            key={p.key}
            style={on ? { backgroundColor: p.color, color: '#fff' } : undefined}
            className={
              'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ' +
              (on ? '' : 'bg-white/10 text-ink-400')
            }
          >
            {p.label}
          </span>
        )
      })}
    </div>
  )
}
