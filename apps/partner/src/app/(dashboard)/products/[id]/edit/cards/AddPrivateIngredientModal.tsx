'use client'

// AddPrivateIngredientModal — creates a SELF_ATTESTED PARTNER_PRIVATE
// Ingredient row with the full metadata downstream systems need:
//
//   * internalName        — used in recipe editor / costing / COA matching
//   * labelDeclarationName — what prints on the FDA label
//                            (e.g., "Natural Flavor" instead of supplier code)
//   * allergenFlags        — Big-9 multi-select; drives AllergensCard auto-derive
//   * bioengineeredStatus  — used by V2 BE disclosure renderer (#144)
//   * densityGPerML        — for volume↔mass conversion in compliance calcs
//   * complianceNotes      — free text, surfaces in admin promotion queue
//
// New rows start at SELF_ATTESTED so the partner can ship immediately, per
// Pavel's "operational trust > margin optimization" decision (memo).
// The admin promotion queue (#140) absorbs cross-partner repeats later.

import { useState, useTransition } from 'react'
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import {
  createPartnerPrivateIngredient,
  type IngredientResult,
} from '../ingredient-actions'

const BIG9_ALLERGENS = [
  { value: 'milk', label: 'Milk' },
  { value: 'eggs', label: 'Eggs' },
  { value: 'fish', label: 'Fish' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'tree_nuts', label: 'Tree nuts' },
  { value: 'peanuts', label: 'Peanuts' },
  { value: 'wheat', label: 'Wheat' },
  { value: 'soybeans', label: 'Soy' },
  { value: 'sesame', label: 'Sesame' },
] as const

const BE_OPTIONS = [
  { value: 'NOT_APPLICABLE', label: 'Not applicable (e.g., mineral, vitamin)' },
  { value: 'NONE', label: 'Not bioengineered' },
  { value: 'DERIVED_FROM_BIOENGINEERED', label: 'Derived from bioengineered source' },
  { value: 'BIOENGINEERED', label: 'Bioengineered food' },
] as const

interface AddPrivateIngredientModalProps {
  initialInternalName?: string
  onCancel: () => void
  onCreated: (ingredient: IngredientResult) => void
}

export function AddPrivateIngredientModal({
  initialInternalName = '',
  onCancel,
  onCreated,
}: AddPrivateIngredientModalProps) {
  const [internalName, setInternalName] = useState(initialInternalName)
  const [labelDeclarationName, setLabelDeclarationName] = useState('')
  const [allergens, setAllergens] = useState<string[]>([])
  const [bioengineeredStatus, setBioengineeredStatus] =
    useState<(typeof BE_OPTIONS)[number]['value']>('NOT_APPLICABLE')
  const [density, setDensity] = useState('')
  const [complianceNotes, setComplianceNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function toggleAllergen(v: string) {
    setAllergens((prev) =>
      prev.includes(v) ? prev.filter((a) => a !== v) : [...prev, v],
    )
  }

  function save() {
    if (!internalName.trim()) {
      toast.error('Internal name is required.')
      return
    }
    startTransition(async () => {
      const result = await createPartnerPrivateIngredient({
        internalName: internalName.trim(),
        labelDeclarationName: labelDeclarationName.trim() || internalName.trim(),
        allergenFlags: allergens,
        bioengineeredStatus,
        densityGPerML: density ? parseFloat(density) : null,
        complianceNotes: complianceNotes.trim() || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Ingredient saved as private (self-attested).')
      onCreated(result.data.ingredient)
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-pink-600" />
            Add private ingredient
          </DialogTitle>
          <DialogDescription>
            Self-attested rows are usable immediately. Admin can promote popular
            private items to the shared library.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">
                Internal name *
              </Label>
              <Input
                value={internalName}
                onChange={(e) => setInternalName(e.target.value)}
                placeholder="Symrise Natural Vanilla 67-B"
                disabled={isPending}
              />
              <p className="text-[10px] text-zinc-500">
                Used in recipe editor + costing. Your view.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">
                Label declaration name
              </Label>
              <Input
                value={labelDeclarationName}
                onChange={(e) => setLabelDeclarationName(e.target.value)}
                placeholder="Natural Flavor"
                disabled={isPending}
              />
              <p className="text-[10px] text-zinc-500">
                What prints on the FDA label. Defaults to internal name.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-zinc-500">
              Allergens (Big-9)
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {BIG9_ALLERGENS.map((a) => {
                const active = allergens.includes(a.value)
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => toggleAllergen(a.value)}
                    disabled={isPending}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      active
                        ? 'border-amber-300 bg-amber-100 text-amber-900'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                    {a.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-zinc-500">
              Drives the Allergens card auto-derive + label allergen statement.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">
                Bioengineered status
              </Label>
              <select
                value={bioengineeredStatus}
                onChange={(e) =>
                  setBioengineeredStatus(e.target.value as typeof bioengineeredStatus)
                }
                disabled={isPending}
                className="block w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
              >
                {BE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-zinc-500">
                Density (g/mL)
              </Label>
              <Input
                type="number"
                step={0.01}
                min={0}
                value={density}
                onChange={(e) => setDensity(e.target.value)}
                placeholder="e.g. 1.05"
                disabled={isPending}
              />
              <p className="text-[10px] text-zinc-500">Optional — used for volume↔mass.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-zinc-500">
              Compliance notes
            </Label>
            <Input
              value={complianceNotes}
              onChange={(e) => setComplianceNotes(e.target.value)}
              placeholder="e.g. FDA class I nutrient, 21 CFR exemption"
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={isPending || !internalName.trim()}
            className="bg-pink-600 hover:bg-pink-700"
          >
            {isPending ? 'Saving…' : 'Save (self-attested)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
