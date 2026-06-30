'use client'

// Partner-authoring counterpart of the admin §7 marketplace-filter editor.
// Sets the four catalog-filter attributes on the template so the marketplace
// sidebar has authoritative data at the source:
//   Format (single) · Manufacturing process · Allergen-free claims · Markets.
// Options come from the shared lists in @ilaunchify/types (same source the
// marketplace sidebar filters on) — except Markets, which is driven by the
// admin's ACTIVE markets (Markets & Regions) so new markets appear here the
// moment they're activated. Each control is a dropdown; autosaves on change.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  formatOptionsForDomain,
  processOptionsForDomain,
  ALLERGEN_FREE_OPTIONS,
} from '@ilaunchify/types'
import { setMarketplaceAttributes } from './build-actions'
import { Field, MultiSelect, type SelectOption } from './_ui'

export function MarketplaceAttributesCard({
  draftId,
  initial,
  domain,
  marketOptions = [{ value: 'US', label: 'United States' }],
  niches,
  lifestyle,
  preview = false,
}: {
  draftId: string | null
  initial: {
    format: string | null
    processes: string[]
    allergenFree: string[]
    markets: string[]
  }
  /** Product domain (LabelingType) — scopes the Format picker to relevant forms. */
  domain?: string | null
  /** ACTIVE markets from admin Markets & Regions (default US-only). */
  marketOptions?: SelectOption[]
  /** Creator niches (Layer 1). `onChange` caps at 3 (1 primary + ≤2 secondary)
   *  upstream; first selected = primary. */
  niches?: {
    options: SelectOption[]
    selected: string[]
    onChange: (next: string[]) => void
  }
  /** Lifestyle-tag filter groups (Diet / Audience / Trend). All three pickers share
   *  one `selected` id list (the LifestyleTag join); `onChange` persists upstream. */
  lifestyle?: {
    diet: SelectOption[]
    audience: SelectOption[]
    trend: SelectOption[]
    selected: string[]
    onChange: (next: string[]) => void
  }
  preview?: boolean
}) {
  const [format, setFormat] = useState<string | null>(initial.format)
  const [processes, setProcesses] = useState<string[]>(initial.processes)
  const [allergenFree, setAllergenFree] = useState<string[]>(initial.allergenFree)
  const [markets, setMarkets] = useState<string[]>(initial.markets.length ? initial.markets : ['US'])
  const [, start] = useTransition()

  // Autosave the whole set. Pass the NEXT value explicitly so we never persist a
  // stale closure value from the just-updated control.
  function persist(next: { format?: string | null; processes?: string[]; allergenFree?: string[]; markets?: string[] }) {
    if (!draftId || preview) return
    start(async () => {
      const r = await setMarketplaceAttributes(draftId, {
        manufacturingFormat: next.format !== undefined ? next.format : format,
        manufacturingProcesses: next.processes ?? processes,
        allergenFreeClaims: next.allergenFree ?? allergenFree,
        marketCodes: next.markets ?? markets,
      })
      if (!r.ok) toast.error(r.error ?? 'Could not save')
      else if (r.staged) toast('Allergen-free change sent for admin review')
    })
  }

  const pickFormat = (value: string) => {
    if (preview) return
    const next = value || null
    setFormat(next)
    persist({ format: next })
  }
  const setMulti = (
    set: (v: string[]) => void,
    key: 'processes' | 'allergenFree' | 'markets',
    next: string[],
  ) => {
    if (preview) return
    set(next)
    persist({ [key]: next })
  }

  // Only formats relevant to the chosen product domain — rendered FLAT (no domain
  // group headers). The group labels (e.g. "Cosmetic") read like categories and are
  // misleading once the list is already scoped to one domain, so a form shared by
  // several domains just appears in each, with no "main category" implied.
  const domainFormats = formatOptionsForDomain(domain)

  return (
    <div className="grid" style={{ gap: 16, gridTemplateColumns: '1fr 1fr' }}>
      {niches && (
        <Field label="Niches">
          <MultiSelect
            options={niches.options}
            selected={niches.selected}
            disabled={preview}
            placeholder="Select niches…"
            onChange={(next) => { if (!preview) niches.onChange(next) }}
          />
        </Field>
      )}

      <Field label="Format">
        <select className="sel" value={format ?? ''} disabled={preview} onChange={(e) => pickFormat(e.target.value)}>
          <option value="">Select…</option>
          {domainFormats.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Manufacturing process">
        <MultiSelect
          options={processOptionsForDomain(domain)}
          selected={processes}
          disabled={preview}
          placeholder="Select processes…"
          onChange={(next) => setMulti(setProcesses, 'processes', next)}
        />
      </Field>

      <Field label="Allergen-free claims">
        <MultiSelect
          options={ALLERGEN_FREE_OPTIONS}
          selected={allergenFree}
          disabled={preview}
          placeholder="Select claims…"
          onChange={(next) => setMulti(setAllergenFree, 'allergenFree', next)}
        />
      </Field>

      <Field label="Markets">
        <MultiSelect
          options={marketOptions}
          selected={markets}
          disabled={preview}
          placeholder="Select markets…"
          onChange={(next) => setMulti(setMarkets, 'markets', next)}
        />
      </Field>

      {/* Lifestyle-tag filters (Layer 4) — Diet / Audience / Trend. All three share
          one selected id list; toggling preserves the other groups' selections. */}
      {lifestyle && (
        <>
          <Field label="Diet">
            <MultiSelect
              options={lifestyle.diet}
              selected={lifestyle.selected}
              disabled={preview}
              placeholder="Select diets…"
              onChange={(next) => { if (!preview) lifestyle.onChange(next) }}
            />
          </Field>
          <Field label="Audience">
            <MultiSelect
              options={lifestyle.audience}
              selected={lifestyle.selected}
              disabled={preview}
              placeholder="Select audiences…"
              onChange={(next) => { if (!preview) lifestyle.onChange(next) }}
            />
          </Field>
          <Field label="Trend">
            <MultiSelect
              options={lifestyle.trend}
              selected={lifestyle.selected}
              disabled={preview}
              placeholder="Select trends…"
              onChange={(next) => { if (!preview) lifestyle.onChange(next) }}
            />
          </Field>
        </>
      )}
    </div>
  )
}
