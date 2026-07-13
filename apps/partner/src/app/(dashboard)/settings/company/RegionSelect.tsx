'use client'

// Country-driven State/Province select (Pavel 2026-07-12) — US states or CA
// provinces from the shared list; any other country falls back to free text.
// Shared by the primary-address block and the facility editor.

import { regionsForCountry } from '@/lib/us-states'

const inputCls =
  'w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 transition-all focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

export function RegionSelect({
  country,
  value,
  onChange,
  onBlur,
}: {
  country: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
}) {
  const regions = regionsForCountry(country)
  if (!regions) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="Region"
        className={inputCls}
      />
    )
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className={inputCls}>
      <option value="">{country === 'CA' ? 'Province…' : 'State…'}</option>
      {regions.map((r) => (
        <option key={r.code} value={r.code}>
          {r.name}
        </option>
      ))}
    </select>
  )
}
