'use client'

// Admin read-only Supplement Facts / Guaranteed Analysis panel with a Base +
// flavor switcher (multi-flavor supplement + pet). Mirrors the creator PDP +
// partner Passport switchers so ops sees exactly what buyers/partners see.

import * as React from 'react'
import { SupplementFactsSvg, GuaranteedAnalysisSvg } from '@ilaunchify/ui'
import type { AdminDomainFacts } from './domain-facts'

export function DomainFactsPanel({ facts }: { facts: AdminDomainFacts }) {
  const [active, setActive] = React.useState<'BASE' | string>('BASE')
  const activeFlavor = active === 'BASE' ? null : facts.flavors.find((f) => f.id === active) ?? null

  const panel = activeFlavor ? activeFlavor.panel : facts.baseNutrition
  const pet = activeFlavor ? activeFlavor.petFacts : facts.basePet
  const scope = active === 'BASE' ? 'Base' : (activeFlavor?.name ?? 'Flavor')

  return (
    <div>
      {facts.flavors.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Facts by flavor">
          <Tab label="Base" active={active === 'BASE'} onClick={() => setActive('BASE')} />
          {facts.flavors.map((f) => (
            <Tab key={f.id} label={f.name} swatchHex={f.swatchHex} active={active === f.id} onClick={() => setActive(f.id)} />
          ))}
        </div>
      )}

      <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-2">{scope}</div>
      <div className="grid place-items-center">
        {facts.kind === 'SUPPLEMENT' && panel && <SupplementFactsSvg data={panel} widthPx={280} />}
        {facts.kind === 'PET' && pet && (
          <GuaranteedAnalysisSvg
            gaRows={pet.gaRows}
            ingredients={pet.ingredients}
            adequacyStatement={pet.adequacyStatement ?? undefined}
            feedingDirections={pet.feedingDirections ?? undefined}
            widthPx={300}
          />
        )}
        {((facts.kind === 'SUPPLEMENT' && !panel) || (facts.kind === 'PET' && !pet)) && (
          <p className="text-[12px] text-ink-500">
            {active === 'BASE' ? 'No base panel authored.' : `${scope} has no separate panel.`}
          </p>
        )}
      </div>
    </div>
  )
}

function Tab({ label, active, onClick, swatchHex }: { label: string; active: boolean; onClick: () => void; swatchHex?: string | null }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ' +
        (active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400')
      }
    >
      {swatchHex && <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full border border-ink-200" style={{ backgroundColor: swatchHex }} />}
      {label}
    </button>
  )
}
