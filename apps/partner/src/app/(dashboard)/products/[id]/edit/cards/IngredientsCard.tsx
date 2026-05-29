'use client'

// Ingredients editor card — slot CRUD + replacement CRUD.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §5 + #131.
//
// Slot model:
//   Each base ingredient lives in its own SLOT (TemplateIngredientSlot row).
//   A slot has 0..N REPLACEMENTS (TemplateIngredientReplacement) — alternatives
//   the creator can swap in (e.g., monk fruit replacing sugar). Per-slot lock
//   (allowReplacement=false) prevents structural ingredients from being swapped.
//
// V1 IngredientPicker (USDA + Library + Partner-private unified search) is
// wired in here as of W2-IP5 — the AddSlotForm + AddReplacementForm bring up
// the picker, and "Create new" inside the picker opens the metadata modal.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import {
  Beaker,
  ChevronDown,
  Lock,
  Plus,
  Trash2,
  Unlock,
  Layers,
} from 'lucide-react'
import {
  addIngredientSlot,
  updateIngredientSlot,
  removeIngredientSlot,
  addReplacement,
  removeReplacement,
} from '../card-actions'
import { IngredientPicker } from './IngredientPicker'
import type { IngredientResult } from '../ingredient-actions'

export interface ReplacementRow {
  id: string
  name: string
  weightGOverride: number | null
  calloutText: string | null
}

export interface SlotRow {
  id: string
  name: string
  weightG: number
  allowReplacement: boolean
  allergens: string[]
  replacements: ReplacementRow[]
}

interface IngredientsCardProps {
  productTemplateId: string
  initialSlots: SlotRow[]
  isDraft: boolean
}

export function IngredientsCard({ productTemplateId, initialSlots, isDraft }: IngredientsCardProps) {
  const router = useRouter()
  const [slots, setSlots] = useState<SlotRow[]>(initialSlots)
  const [showNew, setShowNew] = useState(false)

  function refreshFromServer() {
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {slots.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          No ingredient slots yet. Add at least one base ingredient before submitting.
        </div>
      ) : (
        <ul className="space-y-2">
          {slots.map((s) => (
            <SlotItem
              key={s.id}
              slot={s}
              productTemplateId={productTemplateId}
              isDraft={isDraft}
              onChange={refreshFromServer}
              onLocalUpdate={(patch) =>
                setSlots((prev) => prev.map((row) => (row.id === s.id ? { ...row, ...patch } : row)))
              }
              onLocalRemove={() => setSlots((prev) => prev.filter((row) => row.id !== s.id))}
            />
          ))}
        </ul>
      )}

      {showNew ? (
        <AddSlotForm
          productTemplateId={productTemplateId}
          onCancel={() => setShowNew(false)}
          onAdded={() => {
            setShowNew(false)
            refreshFromServer()
          }}
        />
      ) : isDraft ? (
        <Button variant="outline" size="sm" onClick={() => setShowNew(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add ingredient slot
        </Button>
      ) : null}

      <p className="text-xs text-zinc-500">
        💡 Each ingredient is a SLOT — creators can swap in alternatives you list as
        replacements. Lock a slot if it&apos;s structural (filler, binder).
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// One slot row (collapses to header; expands to manage weight + replacements)
// -----------------------------------------------------------------------------

function SlotItem({
  slot,
  productTemplateId,
  isDraft,
  onChange,
  onLocalUpdate,
  onLocalRemove,
}: {
  slot: SlotRow
  productTemplateId: string
  isDraft: boolean
  onChange: () => void
  onLocalUpdate: (patch: Partial<SlotRow>) => void
  onLocalRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [weightG, setWeightG] = useState(String(slot.weightG))
  const [isPending, startTransition] = useTransition()

  function saveWeight() {
    const v = parseFloat(weightG)
    if (!Number.isFinite(v) || v <= 0) {
      toast.error('Weight must be > 0g.')
      setWeightG(String(slot.weightG))
      return
    }
    if (v === slot.weightG) return
    startTransition(async () => {
      const result = await updateIngredientSlot({ slotId: slot.id, weightG: v })
      if (!result.ok) {
        toast.error(result.error)
        setWeightG(String(slot.weightG))
        return
      }
      onLocalUpdate({ weightG: v })
    })
  }

  function toggleLock() {
    startTransition(async () => {
      const result = await updateIngredientSlot({
        slotId: slot.id,
        allowReplacement: !slot.allowReplacement,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onLocalUpdate({ allowReplacement: !slot.allowReplacement })
    })
  }

  function remove() {
    if (!confirm(`Remove "${slot.name}" + its replacements?`)) return
    startTransition(async () => {
      const result = await removeIngredientSlot(slot.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onLocalRemove()
    })
  }

  return (
    <li className="rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-start gap-3 text-left"
          aria-expanded={expanded}
        >
          <Beaker className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-500" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-900">{slot.name}</span>
              {!slot.allowReplacement && (
                <span title="Locked from swapping" className="text-zinc-400">
                  <Lock className="h-3.5 w-3.5" />
                </span>
              )}
              {slot.replacements.length > 0 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  {slot.replacements.length} alt{slot.replacements.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500">
              <span>{slot.weightG}g</span>
              {slot.allergens.length > 0 && (
                <span className="text-amber-700">{slot.allergens.join(', ')}</span>
              )}
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-zinc-100 bg-zinc-50/30 p-3">
          {/* Weight + lock inline */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">
                Weight (g)
              </Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={weightG}
                onChange={(e) => setWeightG(e.target.value)}
                onBlur={saveWeight}
                disabled={!isDraft || isPending}
                className="w-32"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleLock}
              disabled={!isDraft || isPending}
            >
              {slot.allowReplacement ? (
                <>
                  <Lock className="mr-1.5 h-3.5 w-3.5" /> Lock from swap
                </>
              ) : (
                <>
                  <Unlock className="mr-1.5 h-3.5 w-3.5" /> Allow swap
                </>
              )}
            </Button>
            <div className="ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={remove}
                disabled={!isDraft || isPending}
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove slot
              </Button>
            </div>
          </div>

          {/* Replacements */}
          <ReplacementsList
            slot={slot}
            isDraft={isDraft && slot.allowReplacement}
            onChange={onChange}
          />

          {!slot.allowReplacement && (
            <p className="text-xs text-zinc-500">
              <Lock className="-mt-0.5 mr-1 inline h-3 w-3" /> Unlock the slot above to add
              alternatives.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

// -----------------------------------------------------------------------------
// Replacements list (per-slot)
// -----------------------------------------------------------------------------

function ReplacementsList({
  slot,
  isDraft,
  onChange,
}: {
  slot: SlotRow
  isDraft: boolean
  onChange: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [isPending, startTransition] = useTransition()

  function removeOne(replacementId: string, name: string) {
    if (!confirm(`Remove replacement "${name}"?`)) return
    startTransition(async () => {
      const result = await removeReplacement(replacementId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onChange()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Replacements ({slot.replacements.length})
        </span>
      </div>

      {slot.replacements.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500">
          No alternatives yet. Add one so creators can swap.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {slot.replacements.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-2 rounded border border-zinc-100 bg-white px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium text-zinc-900">{r.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                  {r.weightGOverride != null && <span>→ {r.weightGOverride}g override</span>}
                  {r.calloutText && <em className="text-zinc-600">{r.calloutText}</em>}
                </div>
              </div>
              {isDraft && (
                <button
                  type="button"
                  onClick={() => removeOne(r.id, r.name)}
                  disabled={isPending}
                  className="text-zinc-400 hover:text-red-600"
                  aria-label={`Remove ${r.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showAdd ? (
        <AddReplacementForm
          slot={slot}
          onCancel={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            onChange()
          }}
        />
      ) : isDraft ? (
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add replacement
        </Button>
      ) : null}
    </div>
  )
}

function AddReplacementForm({
  slot,
  onCancel,
  onAdded,
}: {
  slot: SlotRow
  onCancel: () => void
  onAdded: () => void
}) {
  const [picked, setPicked] = useState<IngredientResult | null>(null)
  const [weightOverride, setWeightOverride] = useState('')
  const [callout, setCallout] = useState('')
  const [isPending, startTransition] = useTransition()

  function add() {
    if (!picked) return
    startTransition(async () => {
      const result = await addReplacement({
        slotId: slot.id,
        ingredientId: picked.id,
        weightGOverride: weightOverride ? parseFloat(weightOverride) : null,
        calloutText: callout.trim() || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onAdded()
    })
  }

  return (
    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-zinc-500">
          Replacement ingredient
        </Label>
        {picked ? (
          <div className="flex items-center justify-between gap-2 rounded border border-emerald-200 bg-white px-2.5 py-1.5 text-sm">
            <div className="min-w-0 flex-1 truncate">
              <span className="font-medium">{picked.internalName}</span>
              {picked.labelDeclarationName !== picked.internalName && (
                <span className="ml-1.5 text-xs text-zinc-500">
                  → label: {picked.labelDeclarationName}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Change
            </button>
          </div>
        ) : (
          <IngredientPicker
            placeholder={`Alternative to ${slot.name}`}
            onPick={(ing) => setPicked(ing)}
            autoFocus
          />
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr,1fr]">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">
            Weight override (g)
          </Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={weightOverride}
            onChange={(e) => setWeightOverride(e.target.value)}
            placeholder={String(slot.weightG)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">
            Callout (optional)
          </Label>
          <Input
            value={callout}
            onChange={(e) => setCallout(e.target.value)}
            placeholder='e.g. "Lower glycemic alternative"'
            disabled={isPending}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={add}
          disabled={isPending || !picked}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Add new slot
// -----------------------------------------------------------------------------

function AddSlotForm({
  productTemplateId,
  onCancel,
  onAdded,
}: {
  productTemplateId: string
  onCancel: () => void
  onAdded: () => void
}) {
  const [picked, setPicked] = useState<IngredientResult | null>(null)
  const [weightG, setWeightG] = useState('')
  const [isPending, startTransition] = useTransition()

  function add() {
    const w = parseFloat(weightG)
    if (!picked || !Number.isFinite(w) || w <= 0) return
    startTransition(async () => {
      const result = await addIngredientSlot({
        productTemplateId,
        ingredientId: picked.id,
        weightG: w,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onAdded()
      setPicked(null)
      setWeightG('')
    })
  }

  return (
    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-zinc-500">
          Ingredient
        </Label>
        {picked ? (
          <div className="flex items-center justify-between gap-2 rounded border border-emerald-200 bg-white px-2.5 py-1.5 text-sm">
            <div className="min-w-0 flex-1 truncate">
              <span className="font-medium">{picked.internalName}</span>
              {picked.labelDeclarationName !== picked.internalName && (
                <span className="ml-1.5 text-xs text-zinc-500">
                  → label: {picked.labelDeclarationName}
                </span>
              )}
              {picked.allergenFlags.length > 0 && (
                <span className="ml-1.5 text-xs text-amber-700">
                  ⚠ {picked.allergenFlags.join(', ')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Change
            </button>
          </div>
        ) : (
          <IngredientPicker
            placeholder="e.g. Whey Protein Concentrate"
            onPick={(ing) => setPicked(ing)}
            autoFocus
          />
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr,90px]">
        <div />
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Grams</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={weightG}
            onChange={(e) => setWeightG(e.target.value)}
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={add}
          disabled={isPending || !picked || !weightG}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {isPending ? 'Adding…' : 'Add slot'}
        </Button>
      </div>
    </div>
  )
}
