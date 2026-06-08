'use client'

// Ingredient grouping editor — per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5d.
// Lets the partner bundle base ingredients under FDA-permitted categorical
// names (Spices, Natural Flavors, Artificial Flavors, Spices and Spice Extractives)
// for the printed ingredient statement.
//
// Validation: an ingredient can only belong to ONE group at a time. The UI
// disables already-grouped checkboxes in sibling groups.

import { useMemo, useState, useTransition } from 'react'
import { Input, Label } from '@ilaunchify/ui'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  saveIngredientGroups,
  type IngredientGroupRow,
  type IngredientGroupDisplayMode,
  type IngredientGroupSortAs,
} from '../card-actions'

const ALLOWED_GROUP_NAMES = [
  'Spices',
  'Natural Flavors',
  'Artificial Flavors',
  'Spices and Spice Extractives',
] as const

export interface BaseIngredientOption {
  ingredientId: string
  name: string
  weightG: number
}

interface Props {
  productTemplateId: string
  initial: IngredientGroupRow[]
  baseIngredients: BaseIngredientOption[]
  isDraft: boolean
}

export function IngredientGroupingPanel({
  productTemplateId,
  initial,
  baseIngredients,
  isDraft,
}: Props) {
  const [open, setOpen] = useState(initial.length > 0)
  const [groups, setGroups] = useState<IngredientGroupRow[]>(initial)
  const [isPending, startTransition] = useTransition()

  // Map of ingredientId → name for the per-group list
  const ingredientNameById = useMemo(
    () => new Map(baseIngredients.map((b) => [b.ingredientId, b.name])),
    [baseIngredients],
  )

  function commit(next: IngredientGroupRow[]) {
    setGroups(next)
    startTransition(async () => {
      const result = await saveIngredientGroups({
        productTemplateId,
        groups: next.filter((g) => g.groupName && g.ingredientIds.length > 0),
      })
      if (!result.ok) {
        toast.error(result.error)
      }
    })
  }

  function addGroup() {
    if (groups.length >= ALLOWED_GROUP_NAMES.length) {
      toast.error('All FDA-allowed group names are in use.')
      return
    }
    const used = new Set(groups.map((g) => g.groupName))
    const nextName = ALLOWED_GROUP_NAMES.find((n) => !used.has(n)) ?? 'Spices'
    const next: IngredientGroupRow = {
      groupName: nextName,
      ingredientIds: [],
      displayMode: 'CATEGORY_ONLY',
      sortAs: 'byWeight',
    }
    setGroups([...groups, next])
    setOpen(true)
    // No commit yet — empty group is invalid.
  }

  function updateGroup(index: number, patch: Partial<IngredientGroupRow>) {
    const next = groups.map((g, i) => (i === index ? { ...g, ...patch } : g))
    setGroups(next)
  }

  function toggleIngredient(index: number, ingredientId: string) {
    const g = groups[index]
    if (!g) return
    const includes = g.ingredientIds.includes(ingredientId)
    const updated = includes
      ? g.ingredientIds.filter((id) => id !== ingredientId)
      : [...g.ingredientIds, ingredientId]
    const next = groups.map((row, i) =>
      i === index ? { ...row, ingredientIds: updated } : row,
    )
    commit(next)
  }

  function removeGroup(index: number) {
    const next = groups.filter((_, i) => i !== index)
    commit(next)
  }

  function commitName(index: number) {
    // Names are constrained → safe to commit on blur
    commit(groups)
  }

  return (
    <div className="rounded-md border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-ink-50"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink-900">
            Ingredient grouping{' '}
            <span className="ml-1 rounded bg-ink-100 px-1.5 py-0.5 text-xs font-normal text-ink-600">
              label statement
            </span>
          </span>
          {groups.length > 0 && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">
              {groups.length} group{groups.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-ink-100 px-4 py-4">
          <p className="text-xs text-ink-500">
            Bundle base ingredients under an FDA-permitted category name (21 CFR 101.4).
            One group renders as a single entry on the printed ingredient statement.
          </p>

          {baseIngredients.length === 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Add base ingredient slots first. Grouping needs at least one ingredient.
            </p>
          )}

          {groups.length === 0 ? (
            <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-500">
              No groups. The ingredient statement will list each base ingredient by name.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((group, index) => {
                // ids claimed by sibling groups — disable checkbox here
                const otherClaimed = new Set(
                  groups
                    .filter((_, j) => j !== index)
                    .flatMap((g) => g.ingredientIds),
                )
                return (
                  <div
                    key={index}
                    className="space-y-3 rounded-md border border-ink-200 p-3"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,180px,160px,auto]">
                      <div>
                        <Label className="text-xs text-ink-500">Group name</Label>
                        <select
                          value={group.groupName}
                          onChange={(e) => updateGroup(index, { groupName: e.target.value })}
                          onBlur={() => commitName(index)}
                          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-2 py-1.5 text-sm"
                          disabled={!isDraft || isPending}
                        >
                          {ALLOWED_GROUP_NAMES.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-ink-500">Display mode</Label>
                        <select
                          value={group.displayMode}
                          onChange={(e) => {
                            const v = e.target.value as IngredientGroupDisplayMode
                            updateGroup(index, { displayMode: v })
                            setTimeout(
                              () =>
                                commit(
                                  groups.map((g, i) =>
                                    i === index ? { ...g, displayMode: v } : g,
                                  ),
                                ),
                              0,
                            )
                          }}
                          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-2 py-1.5 text-sm"
                          disabled={!isDraft || isPending}
                        >
                          <option value="CATEGORY_ONLY">Category only</option>
                          <option value="CATEGORY_WITH_SUBLIST">With sub-list</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-ink-500">Sort as</Label>
                        <select
                          value={group.sortAs}
                          onChange={(e) => {
                            const v = e.target.value as IngredientGroupSortAs
                            updateGroup(index, { sortAs: v })
                            setTimeout(
                              () =>
                                commit(
                                  groups.map((g, i) =>
                                    i === index ? { ...g, sortAs: v } : g,
                                  ),
                                ),
                              0,
                            )
                          }}
                          className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-2 py-1.5 text-sm"
                          disabled={!isDraft || isPending}
                        >
                          <option value="byWeight">By group weight</option>
                          <option value="asWritten">Position of first member</option>
                        </select>
                      </div>
                      <div className="flex items-end justify-end">
                        <button
                          type="button"
                          onClick={() => removeGroup(index)}
                          className="rounded-md p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600"
                          title="Remove group"
                          disabled={!isDraft || isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-ink-500">Base ingredients in this group</Label>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {baseIngredients.map((b) => {
                          const checked = group.ingredientIds.includes(b.ingredientId)
                          const blockedBySibling = otherClaimed.has(b.ingredientId)
                          return (
                            <label
                              key={b.ingredientId}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                                blockedBySibling && !checked
                                  ? 'cursor-not-allowed border-ink-200 bg-ink-50 text-ink-400'
                                  : checked
                                    ? 'border-blue-300 bg-blue-50 text-blue-900'
                                    : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="h-3 w-3"
                                checked={checked}
                                disabled={
                                  !isDraft ||
                                  isPending ||
                                  (blockedBySibling && !checked)
                                }
                                onChange={() => toggleIngredient(index, b.ingredientId)}
                              />
                              {b.name}
                            </label>
                          )
                        })}
                      </div>
                      {group.ingredientIds.length === 0 && (
                        <p className="mt-1.5 text-[11px] text-amber-700">
                          Pick at least one ingredient — empty groups aren&apos;t saved.
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {isDraft && baseIngredients.length > 0 && (
            <button
              type="button"
              onClick={addGroup}
              disabled={groups.length >= ALLOWED_GROUP_NAMES.length || isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-ink-300 px-3 py-1.5 text-xs text-ink-700 hover:border-ink-400 hover:bg-ink-50 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add group
            </button>
          )}
        </div>
      )}
    </div>
  )
}
