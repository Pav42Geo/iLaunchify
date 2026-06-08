'use client'

// Flavor presets — one ProductTemplate + N FlavorPreset overlays (flavors are
// presets, NOT separate products). Each preset carries its own FDA Statement of
// Identity (the food's common name, e.g. "Chocolate Flavored Whey Protein
// Powder"), which must differ from the marketplace product name.
//
// Self-contained + action-injected: the parent (a client component) passes the
// real server actions, so this typechecks before the FlavorPreset.
// statementOfIdentity migration lands and drops straight in afterward.

import { useState, useTransition } from 'react'
import { Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronDown, Palette } from 'lucide-react'

export type FlavorPresetStatus = 'ACTIVE' | 'DRAFT' | 'RETIRED'

export interface FlavorPresetRow {
  id: string
  name: string
  /** Per-flavor FDA Statement of Identity (overrides the template default). */
  statementOfIdentity: string | null
  swatchHex: string | null
  priceDeltaCents: number
  status: FlavorPresetStatus
  sortOrder: number
}

export type FlavorActionResult = { ok: true } | { ok: false; error: string }

export type FlavorPresetPatch = Partial<
  Pick<FlavorPresetRow, 'name' | 'statementOfIdentity' | 'swatchHex' | 'priceDeltaCents' | 'status'>
>

interface FlavorPresetsPanelProps {
  initial: FlavorPresetRow[]
  isDraft: boolean
  /** Marketplace product name — shown so the SoI stays distinct from it. */
  productName: string
  /** Template-level default SoI (the fallback when a preset leaves it blank). */
  defaultStatementOfIdentity: string | null
  onAdd: (name: string) => Promise<FlavorActionResult & { id?: string }>
  onUpdate: (id: string, patch: FlavorPresetPatch) => Promise<FlavorActionResult>
  onRemove: (id: string) => Promise<FlavorActionResult>
}

const STATUS_CHIP: Record<FlavorPresetStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DRAFT: 'bg-ink-100 text-ink-600 ring-ink-200',
  RETIRED: 'bg-rose-50 text-rose-600 ring-rose-200',
}

export function FlavorPresetsPanel({
  initial,
  isDraft,
  productName,
  defaultStatementOfIdentity,
  onAdd,
  onUpdate,
  onRemove,
}: FlavorPresetsPanelProps) {
  const [presets, setPresets] = useState<FlavorPresetRow[]>(initial)
  const [newName, setNewName] = useState('')
  const [isPending, startTransition] = useTransition()

  function add() {
    const name = newName.trim()
    if (name.length < 1) return
    if (presets.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists.`)
      return
    }
    startTransition(async () => {
      const res = await onAdd(name)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setPresets((prev) => [
        ...prev,
        {
          id: res.id ?? `tmp-${Date.now()}`,
          name,
          statementOfIdentity: null,
          swatchHex: null,
          priceDeltaCents: 0,
          status: 'DRAFT',
          sortOrder: prev.length,
        },
      ])
      setNewName('')
    })
  }

  return (
    <div className="space-y-3">
      {presets.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-6 text-center text-sm text-ink-500">
          No flavors yet. One product, many flavor presets — each overlays the base recipe and
          gets its own label.
        </div>
      ) : (
        <ul className="space-y-2">
          {presets.map((p) => (
            <FlavorItem
              key={p.id}
              preset={p}
              isDraft={isDraft}
              productName={productName}
              defaultStatementOfIdentity={defaultStatementOfIdentity}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onLocalUpdate={(patch) =>
                setPresets((prev) => prev.map((r) => (r.id === p.id ? { ...r, ...patch } : r)))
              }
              onLocalRemove={() => setPresets((prev) => prev.filter((r) => r.id !== p.id))}
            />
          ))}
        </ul>
      )}

      {isDraft && (
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            placeholder="New flavor (e.g. Chocolate)"
            maxLength={60}
            disabled={isPending}
            className="max-w-xs"
          />
          <button
            type="button"
            onClick={add}
            disabled={isPending || newName.trim().length === 0}
            className="inline-flex items-center rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:bg-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add flavor
          </button>
        </div>
      )}

      <p className="rounded-lg bg-pink-50 px-3 py-2 text-[11px] text-pink-700">
        Each flavor is a preset over the base recipe — never a separate product. Its Statement of
        Identity is the FDA common name printed on that flavor&apos;s label and must read
        differently from the marketplace product name.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// One flavor row — collapsible inline editor
// -----------------------------------------------------------------------------

function FlavorItem({
  preset,
  isDraft,
  productName,
  defaultStatementOfIdentity,
  onUpdate,
  onRemove,
  onLocalUpdate,
  onLocalRemove,
}: {
  preset: FlavorPresetRow
  isDraft: boolean
  productName: string
  defaultStatementOfIdentity: string | null
  onUpdate: (id: string, patch: FlavorPresetPatch) => Promise<FlavorActionResult>
  onRemove: (id: string) => Promise<FlavorActionResult>
  onLocalUpdate: (patch: FlavorPresetPatch) => void
  onLocalRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(preset.name)
  const [soi, setSoi] = useState(preset.statementOfIdentity ?? '')
  const [swatch, setSwatch] = useState(preset.swatchHex ?? '#FF2E63')
  const [priceDelta, setPriceDelta] = useState((preset.priceDeltaCents / 100).toFixed(2))

  function commit(patch: FlavorPresetPatch) {
    if (Object.keys(patch).length === 0) return
    startTransition(async () => {
      const res = await onUpdate(preset.id, patch)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      onLocalUpdate(patch)
    })
  }

  const soiClashesName = soi.trim().length > 0 && soi.trim().toLowerCase() === productName.trim().toLowerCase()

  function remove() {
    if (!confirm(`Remove flavor "${preset.name}"?`)) return
    startTransition(async () => {
      const res = await onRemove(preset.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      onLocalRemove()
    })
  }

  return (
    <li className="rounded-md border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <span
          className="h-5 w-5 flex-shrink-0 rounded-full border border-ink-200"
          style={{ backgroundColor: preset.swatchHex ?? '#E0E1E5' }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink-900">{preset.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${STATUS_CHIP[preset.status]}`}
            >
              {preset.status}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-500">
            {preset.statementOfIdentity || (
              <span className="italic text-ink-400">
                Uses default SoI{defaultStatementOfIdentity ? ` — “${defaultStatementOfIdentity}”` : ''}
              </span>
            )}
            {preset.priceDeltaCents !== 0 && (
              <span className="ml-2 text-ink-600">
                {preset.priceDeltaCents > 0 ? '+' : '−'}$
                {Math.abs(preset.priceDeltaCents / 100).toFixed(2)}
              </span>
            )}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-ink-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-ink-100 bg-ink-50/30 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Flavor name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name !== preset.name && commit({ name: name.trim() })}
                disabled={!isDraft || isPending}
              />
            </Field>
            <Field label="Status">
              <select
                value={preset.status}
                onChange={(e) => commit({ status: e.target.value as FlavorPresetStatus })}
                disabled={!isDraft || isPending}
                className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="RETIRED">Retired</option>
              </select>
            </Field>
          </div>

          <Field
            label="Statement of Identity (this flavor)"
            hint="FDA common name on this flavor's label. Leave blank to use the product default. Must differ from the marketplace product name."
          >
            <Input
              value={soi}
              onChange={(e) => setSoi(e.target.value)}
              onBlur={() => commit({ statementOfIdentity: soi.trim() || null })}
              placeholder={defaultStatementOfIdentity ?? 'e.g. Chocolate Flavored Whey Protein Powder'}
              disabled={!isDraft || isPending}
            />
            {soiClashesName && (
              <p className="text-[11px] font-medium text-rose-600">
                This matches the product name — the Statement of Identity should read differently.
              </p>
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Swatch color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={swatch}
                  onChange={(e) => setSwatch(e.target.value)}
                  onBlur={() => commit({ swatchHex: swatch })}
                  disabled={!isDraft || isPending}
                  className="h-9 w-12 cursor-pointer rounded border border-ink-300 bg-white"
                  aria-label="Flavor swatch color"
                />
                <span className="inline-flex items-center gap-1 text-[12px] text-ink-500">
                  <Palette className="h-3.5 w-3.5" aria-hidden="true" /> {swatch}
                </span>
              </div>
            </Field>
            <Field label="Price delta (USD)" hint="Added to the per-size base price for this flavor">
              <div className="flex max-w-[8rem] items-stretch overflow-hidden rounded-md border border-ink-300">
                <span className="flex items-center bg-ink-50 px-2.5 text-xs text-ink-500">$</span>
                <input
                  type="number"
                  step={0.01}
                  value={priceDelta}
                  onChange={(e) => setPriceDelta(e.target.value)}
                  onBlur={() => {
                    const cents = Math.round(parseFloat(priceDelta) * 100)
                    commit({ priceDeltaCents: Number.isFinite(cents) ? cents : 0 })
                  }}
                  className="block w-full bg-white px-2.5 py-2 text-sm focus:outline-none"
                  disabled={!isDraft || isPending}
                />
              </div>
            </Field>
          </div>

          {isDraft && (
            <div className="flex justify-end border-t border-ink-100 pt-3">
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                className="inline-flex items-center rounded-md px-2.5 py-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Remove flavor
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-ink-500">{label}</Label>
      {hint && <p className="text-[11px] leading-snug text-ink-500">{hint}</p>}
      {children}
    </div>
  )
}
