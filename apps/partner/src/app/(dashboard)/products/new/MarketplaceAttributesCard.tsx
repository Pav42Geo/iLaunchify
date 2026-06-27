'use client'

// Partner-authoring counterpart of the admin §7 marketplace-filter editor.
// Lets the partner set the four catalog-filter attributes on their template so
// the marketplace sidebar has authoritative data at the source:
//   Format (single) · Manufacturing process · Allergen-free claims · Markets.
// Options come from the shared lists in @ilaunchify/types — the SAME source the
// marketplace sidebar filters on, so what's set here always matches what buyers
// can filter by. Autosaves on every change (silent; error/staged toasts only).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  FORMAT_OPTIONS,
  MANUFACTURING_PROCESS_OPTIONS,
  ALLERGEN_FREE_OPTIONS,
  MARKET_FILTER_OPTIONS,
  type FilterOption,
} from '@ilaunchify/types'
import { setMarketplaceAttributes } from './build-actions'

export function MarketplaceAttributesCard({
  draftId,
  initial,
  preview = false,
}: {
  draftId: string | null
  initial: {
    format: string | null
    processes: string[]
    allergenFree: string[]
    markets: string[]
  }
  preview?: boolean
}) {
  const [format, setFormat] = useState<string | null>(initial.format)
  const [processes, setProcesses] = useState<Set<string>>(new Set(initial.processes))
  const [allergenFree, setAllergenFree] = useState<Set<string>>(new Set(initial.allergenFree))
  const [markets, setMarkets] = useState<Set<string>>(new Set(initial.markets.length ? initial.markets : ['US']))
  const [, start] = useTransition()

  // Autosave the whole set. Pass the NEXT value explicitly so we never persist a
  // stale closure value from the just-updated control.
  function persist(next: { format?: string | null; processes?: Set<string>; allergenFree?: Set<string>; markets?: Set<string> }) {
    if (!draftId || preview) return
    start(async () => {
      const r = await setMarketplaceAttributes(draftId, {
        manufacturingFormat: next.format !== undefined ? next.format : format,
        manufacturingProcesses: [...(next.processes ?? processes)],
        allergenFreeClaims: [...(next.allergenFree ?? allergenFree)],
        marketCodes: [...(next.markets ?? markets)],
      })
      if (!r.ok) toast.error(r.error ?? 'Could not save')
      else if (r.staged) toast('Allergen-free change sent for admin review')
    })
  }

  const pickFormat = (value: string) => {
    if (preview) return
    const next = format === value ? null : value // click active → clear
    setFormat(next)
    persist({ format: next })
  }
  const toggle = (
    set: React.Dispatch<React.SetStateAction<Set<string>>>,
    current: Set<string>,
    key: 'processes' | 'allergenFree' | 'markets',
    value: string,
  ) => {
    if (preview) return
    const nextSet = new Set(current)
    if (nextSet.has(value)) nextSet.delete(value)
    else nextSet.add(value)
    set(nextSet)
    persist({ [key]: nextSet }) // side-effect OUTSIDE the state updater
  }

  return (
    <div className="field" style={{ gridColumn: '1/3' }}>
      <label>Marketplace filters</label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 2 }}>
        {/* Format — single-select */}
        <Group title="Format" hint="Physical production form (single).">
          <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
            {FORMAT_OPTIONS.map((o) => (
              <Chip key={o.value} on={format === o.value} disabled={preview} onClick={() => pickFormat(o.value)}>{o.label}</Chip>
            ))}
          </div>
        </Group>

        <Group title="Manufacturing process" hint="How it's produced. Multi-select.">
          <ChipMulti options={MANUFACTURING_PROCESS_OPTIONS} active={processes} disabled={preview} onToggle={(v) => toggle(setProcesses, processes, 'processes', v)} />
        </Group>

        <Group title="Allergen-free claims" hint="An explicit free-from claim — only check what the product is verified to be.">
          <ChipMulti options={ALLERGEN_FREE_OPTIONS} active={allergenFree} disabled={preview} onToggle={(v) => toggle(setAllergenFree, allergenFree, 'allergenFree', v)} />
        </Group>

        <Group title="Markets" hint="Markets this template is available in. V1: US only is ACTIVE.">
          <ChipMulti options={MARKET_FILTER_OPTIONS} active={markets} disabled={preview} onToggle={(v) => toggle(setMarkets, markets, 'markets', v)} />
        </Group>
      </div>
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-800)' }}>{title}</span>
        {hint && <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ChipMulti({ options, active, disabled, onToggle }: { options: FilterOption[]; active: Set<string>; disabled?: boolean; onToggle: (value: string) => void }) {
  return (
    <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <Chip key={o.value} on={active.has(o.value)} disabled={disabled} onClick={() => onToggle(o.value)}>{o.label}</Chip>
      ))}
    </div>
  )
}

function Chip({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={'chip' + (on ? ' on' : '')}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      style={{ fontFamily: 'inherit', ...(disabled ? { opacity: 0.6, cursor: 'default' } : {}) }}
    >
      {on && <span aria-hidden style={{ fontSize: 10, fontWeight: 700 }}>✓</span>}
      {children}
    </button>
  )
}
