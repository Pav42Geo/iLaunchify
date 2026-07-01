'use client'

// Per-flavor Supplement Facts / Guaranteed Analysis switcher for the marketplace
// PDP. Multi-flavor supplement + pet products can carry a distinct regulated panel
// per flavor (getTemplateFlavorDomainFacts). This client component shows a Base +
// flavor tab row and swaps the rendered panel. Single-flavor / no per-flavor data
// → the page renders the static base panel instead (this never mounts).

import * as React from 'react'
import { NutritionFactsRenderer, GuaranteedAnalysisSvg } from '@ilaunchify/ui'
import type { PanelData } from '@ilaunchify/types'
import type { DomainFacts } from '@/lib/recipe-detail'
import type { FlavorDomainView } from '@/lib/flavor-domain-facts'

export interface DomainFactsSwitcherProps {
  kind: 'SUPPLEMENT' | 'PET'
  /** Base product panel (shown on the "Base" tab). */
  baseNutrition?: PanelData | null
  baseDomain?: DomainFacts
  /** Supplement declared-by-manufacturer flag (base tab only). */
  declared?: boolean
  /** Per-flavor panels — each becomes a tab. */
  flavors: FlavorDomainView[]
  widthPx?: number
}

export function DomainFactsSwitcher({
  kind,
  baseNutrition = null,
  baseDomain = null,
  declared = false,
  flavors,
  widthPx = 300,
}: DomainFactsSwitcherProps) {
  const [active, setActive] = React.useState<'BASE' | string>('BASE')
  const activeFlavor = active === 'BASE' ? null : flavors.find((f) => f.id === active) ?? null

  // Resolve which panel to show for the active tab.
  const nutrition = activeFlavor ? activeFlavor.nutrition : baseNutrition
  const domain = activeFlavor ? activeFlavor.domain : baseDomain
  const label = kind === 'SUPPLEMENT' ? 'Supplement Facts' : 'Guaranteed Analysis'
  const scope = active === 'BASE' ? 'base recipe' : (activeFlavor?.name ?? 'flavor')

  return (
    <div>
      {/* Base + flavor tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label={`${label} by flavor`}>
        <FlavorTab label="Base" active={active === 'BASE'} onClick={() => setActive('BASE')} />
        {flavors.map((f) => (
          <FlavorTab
            key={f.id}
            label={f.name}
            swatchHex={f.swatchHex}
            active={active === f.id}
            onClick={() => setActive(f.id)}
          />
        ))}
      </div>

      <div className="text-[12px] font-bold uppercase tracking-[0.07em] text-ink-700 mb-3">
        {label} <span className="font-semibold text-ink-400">· {scope}</span>
      </div>

      {kind === 'SUPPLEMENT' && nutrition && (
        <NutritionFactsRenderer data={nutrition} widthPx={widthPx} declaredByManufacturer={active === 'BASE' && declared} />
      )}
      {kind === 'PET' && domain && domain.kind === 'PET' && (
        <GuaranteedAnalysisSvg
          gaRows={domain.gaRows}
          ingredients={domain.ingredients}
          adequacyStatement={domain.adequacyStatement}
          feedingDirections={domain.feedingDirections}
          widthPx={Math.max(widthPx, 340)}
        />
      )}

      <div className="text-[11px] text-ink-500 mt-2" style={{ maxWidth: widthPx }}>
        {active === 'BASE'
          ? 'The base product panel. Computed from the manufacturer’s formulation and re-validated by the compliance service before production.'
          : `${activeFlavor?.name}’s own panel — this flavor is formulated separately.`}
      </div>
    </div>
  )
}

function FlavorTab({
  label,
  active,
  onClick,
  swatchHex,
}: {
  label: string
  active: boolean
  onClick: () => void
  swatchHex?: string | null
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ' +
        (active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400')
      }
    >
      {swatchHex && (
        <span className="inline-block h-2.5 w-2.5 rounded-full border border-ink-200" style={{ backgroundColor: swatchHex }} aria-hidden="true" />
      )}
      {label}
    </button>
  )
}
