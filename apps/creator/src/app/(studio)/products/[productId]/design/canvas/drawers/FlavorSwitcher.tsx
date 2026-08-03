'use client'

// Per-flavor label safety — flavor switcher (Signal) (docs/PER_FLAVOR_LABEL_SAFETY_UX.md).
// Presentational only: the single control that sets which flavor the creator is editing. It renders
// the SELECTED flavors it's given (the caller scopes to the creator's subset — this component never
// fetches). Each pill shows the flavor swatch + name; the active one is highlighted; "Editing: X"
// makes the current flavor unmistakable. Optional "Base (all)" pill for the shared base design.

import * as React from 'react'

export interface FlavorSwitcherItem {
  id: string
  name: string
  swatchHex: string | null
}

export function FlavorSwitcher({
  flavors,
  activeId,
  onSelect,
  includeBase = false,
}: {
  /** The flavors the creator SELECTED for this product (not the full template pool). */
  flavors: FlavorSwitcherItem[]
  /** Active flavor id, or null for the shared base. */
  activeId: string | null
  onSelect: (id: string | null) => void
  /** Show a "Base (all)" pill that edits the shared base design. */
  includeBase?: boolean
}) {
  if (flavors.length === 0) return null

  const activeName =
    activeId === null ? (includeBase ? 'Base — all flavors' : null) : flavors.find((f) => f.id === activeId)?.name ?? null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        Editing: <span className="text-ink-900">{activeName ?? '—'}</span>
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {includeBase && <Pill label="Base" swatch={null} active={activeId === null} onClick={() => onSelect(null)} />}
        {flavors.map((f) => (
          <Pill key={f.id} label={f.name} swatch={f.swatchHex} active={activeId === f.id} onClick={() => onSelect(f.id)} />
        ))}
      </div>
    </div>
  )
}

function Pill({
  label,
  swatch,
  active,
  onClick,
}: {
  label: string
  swatch: string | null
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
        active ? 'border-success-500 bg-success-50 text-ink-900 ring-1 ring-pink-500' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
      }`}
    >
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-full border border-ink-200"
        style={{ backgroundColor: swatch ?? 'transparent' }}
        aria-hidden
      />
      <span className="max-w-[9rem] truncate">{label}</span>
    </button>
  )
}
