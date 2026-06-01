'use client'

// Manual nutrient overrides — per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5c.
// Compact collapsible sub-section that lives inside the Basics card. Each row:
// nutrient picker · value input · reason input (required) · remove.
//
// Wire: saveNutrientOverrides server action. Saves on Add / Remove / blur.

import { useState, useTransition } from 'react'
import { Input, Label } from '@ilaunchify/ui'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  saveNutrientOverrides,
  type NutrientOverrideRow,
} from '../card-actions'

// FDA panel-relevant nutrients the editor exposes. Mirror of ALLOWED_NUTRIENTS
// in services/compliance/app/overrides.py.
const NUTRIENT_OPTIONS: Array<{ id: string; label: string; unit: string }> = [
  { id: 'calories', label: 'Calories', unit: 'kcal' },
  { id: 'totalFat', label: 'Total Fat', unit: 'g' },
  { id: 'saturatedFat', label: 'Saturated Fat', unit: 'g' },
  { id: 'transFat', label: 'Trans Fat', unit: 'g' },
  { id: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  { id: 'sodium', label: 'Sodium', unit: 'mg' },
  { id: 'totalCarbohydrate', label: 'Total Carbohydrate', unit: 'g' },
  { id: 'dietaryFiber', label: 'Dietary Fiber', unit: 'g' },
  { id: 'totalSugars', label: 'Total Sugars', unit: 'g' },
  { id: 'addedSugars', label: 'Added Sugars', unit: 'g' },
  { id: 'protein', label: 'Protein', unit: 'g' },
  { id: 'vitaminD', label: 'Vitamin D', unit: 'µg' },
  { id: 'calcium', label: 'Calcium', unit: 'mg' },
  { id: 'iron', label: 'Iron', unit: 'mg' },
  { id: 'potassium', label: 'Potassium', unit: 'mg' },
  { id: 'vitaminA', label: 'Vitamin A', unit: 'µg' },
  { id: 'vitaminC', label: 'Vitamin C', unit: 'mg' },
  { id: 'vitaminE', label: 'Vitamin E', unit: 'mg' },
]

const UNIT_BY_ID: Record<string, string> = Object.fromEntries(
  NUTRIENT_OPTIONS.map((n) => [n.id, n.unit]),
)

interface Props {
  productTemplateId: string
  initial: NutrientOverrideRow[]
  isDraft: boolean
}

export function NutrientOverridesPanel({ productTemplateId, initial, isDraft }: Props) {
  const [open, setOpen] = useState(initial.length > 0)
  const [rows, setRows] = useState<NutrientOverrideRow[]>(initial)
  const [isPending, startTransition] = useTransition()

  function commit(next: NutrientOverrideRow[]) {
    setRows(next)
    startTransition(async () => {
      const result = await saveNutrientOverrides({
        productTemplateId,
        overrides: next,
      })
      if (!result.ok) {
        toast.error(result.error)
      }
    })
  }

  function addRow() {
    // First available nutrient that isn't already in use
    const used = new Set(rows.map((r) => r.nutrient))
    const next = NUTRIENT_OPTIONS.find((n) => !used.has(n.id))
    if (!next) {
      toast.error('All nutrients already have an override.')
      return
    }
    const updated = [...rows, { nutrient: next.id, value: 0, reason: '' }]
    setRows(updated)
    setOpen(true)
    // Don't commit yet — wait until the partner fills in a reason.
  }

  function updateRow(index: number, patch: Partial<NutrientOverrideRow>) {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    setRows(next)
  }

  function commitRow(index: number) {
    // Commit only complete rows. Incomplete rows persist locally until filled.
    const completeRows = rows.filter(
      (r) => r.nutrient && Number.isFinite(r.value) && r.value >= 0 && r.reason.trim(),
    )
    commit(completeRows)
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index)
    commit(next)
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-zinc-50"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900">
            Nutrient overrides{' '}
            <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-600">
              advanced
            </span>
          </span>
          {rows.length > 0 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              {rows.length} active
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-zinc-100 px-4 py-4">
          <p className="text-xs text-zinc-500">
            Override a final per-serving value after the recipe sums. Applied before FDA
            rounding. Captured for audit — re-triggers admin review on live products.
          </p>

          {rows.length === 0 ? (
            <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              No overrides. The calculated nutrition will be used as-is.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row, index) => {
                const used = new Set(
                  rows.filter((_, j) => j !== index).map((r) => r.nutrient),
                )
                const unit = UNIT_BY_ID[row.nutrient] ?? ''
                return (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-2 rounded-md border border-zinc-200 p-3 sm:grid-cols-[170px,140px,1fr,auto]"
                  >
                    <div>
                      <Label className="text-xs text-zinc-500">Nutrient</Label>
                      <select
                        value={row.nutrient}
                        onChange={(e) => {
                          updateRow(index, { nutrient: e.target.value })
                          // Re-commit on change since shape is final
                          setTimeout(() => commitRow(index), 0)
                        }}
                        className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                        disabled={!isDraft || isPending}
                      >
                        {NUTRIENT_OPTIONS.map((n) => (
                          <option
                            key={n.id}
                            value={n.id}
                            disabled={used.has(n.id) && n.id !== row.nutrient}
                          >
                            {n.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500">Value ({unit})</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        value={row.value}
                        onChange={(e) =>
                          updateRow(index, { value: Number(e.target.value) })
                        }
                        onBlur={() => commitRow(index)}
                        disabled={!isDraft || isPending}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500">Reason (required)</Label>
                      <Input
                        value={row.reason}
                        onChange={(e) => updateRow(index, { reason: e.target.value })}
                        onBlur={() => commitRow(index)}
                        placeholder="e.g. moisture loss in baking"
                        maxLength={140}
                        disabled={!isDraft || isPending}
                      />
                    </div>
                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove override"
                        disabled={!isDraft || isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {isDraft && (
            <button
              type="button"
              onClick={addRow}
              disabled={rows.length >= NUTRIENT_OPTIONS.length || isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add override
            </button>
          )}
        </div>
      )}
    </div>
  )
}
