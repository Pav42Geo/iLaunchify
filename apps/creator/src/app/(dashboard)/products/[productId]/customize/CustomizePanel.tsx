'use client'

import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  NutritionFactsRenderer,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ilaunchify/ui'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Lock, Sparkles } from 'lucide-react'
import { sumNutrients, percentDailyValue, type NutrientProfilePer100g } from '@/lib/nutrition'
import type { PanelData } from '@ilaunchify/types'
import { saveCustomization } from './actions'

interface Slot {
  id: string
  label: string
  description: string | null
  allowReplacement: boolean
  weightG: number
  base: {
    ingredientId: string
    name: string
    allergens: string[]
    nutritionPer100g: Record<string, number>
  }
  replacements: Array<{
    id: string
    ingredientId: string
    name: string
    allergens: string[]
    nutritionPer100g: Record<string, number>
    weightGOverride: number | null
    calloutText: string | null
  }>
  currentPick: string
}

interface Optional {
  id: string
  ingredientId: string
  name: string
  weightG: number
  calloutText: string | null
  allergens: string[]
  nutritionPer100g: Record<string, number>
  isOn: boolean
}

export function CustomizePanel({
  productId,
  recipeId,
  servingsPerContainer,
  servingSizeG,
  servingSizeDesc,
  productCategory,
  slots,
  optionals,
}: {
  productId: string
  recipeId: string
  servingsPerContainer: number
  servingSizeG: number
  servingSizeDesc: string
  productCategory: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT'
  slots: Slot[]
  optionals: Optional[]
}) {
  const router = useRouter()
  const [slotPicks, setSlotPicks] = useState<Record<string, string>>(
    Object.fromEntries(slots.map((s) => [s.id, s.currentPick])),
  )
  const [optionalState, setOptionalState] = useState<Record<string, boolean>>(
    Object.fromEntries(optionals.map((o) => [o.ingredientId, o.isOn])),
  )
  const [saving, setSaving] = useState(false)

  // Resolve final ingredient list given current selections
  const resolved = useMemo(() => {
    const items: Array<{
      ingredientId: string
      name: string
      weightG: number
      nutritionPer100g: NutrientProfilePer100g
      allergens: string[]
      source: 'TEMPLATE_BASE' | 'TEMPLATE_REPLACEMENT' | 'TEMPLATE_OPTIONAL'
      filledSlotId: string | null
    }> = []

    for (const slot of slots) {
      const pickedId = slotPicks[slot.id] ?? slot.base.ingredientId
      if (pickedId === slot.base.ingredientId) {
        items.push({
          ingredientId: slot.base.ingredientId,
          name: slot.base.name,
          weightG: slot.weightG,
          nutritionPer100g: slot.base.nutritionPer100g as NutrientProfilePer100g,
          allergens: slot.base.allergens,
          source: 'TEMPLATE_BASE',
          filledSlotId: slot.id,
        })
      } else {
        const rep = slot.replacements.find((r) => r.ingredientId === pickedId)
        if (rep) {
          items.push({
            ingredientId: rep.ingredientId,
            name: rep.name,
            weightG: rep.weightGOverride ?? slot.weightG,
            nutritionPer100g: rep.nutritionPer100g as NutrientProfilePer100g,
            allergens: rep.allergens,
            source: 'TEMPLATE_REPLACEMENT',
            filledSlotId: slot.id,
          })
        }
      }
    }

    for (const opt of optionals) {
      if (optionalState[opt.ingredientId]) {
        items.push({
          ingredientId: opt.ingredientId,
          name: opt.name,
          weightG: opt.weightG,
          nutritionPer100g: opt.nutritionPer100g as NutrientProfilePer100g,
          allergens: opt.allergens,
          source: 'TEMPLATE_OPTIONAL',
          filledSlotId: null,
        })
      }
    }

    return items
  }, [slots, slotPicks, optionals, optionalState])

  // Live nutrition + allergen recalc
  const liveAllergens = useMemo(() => {
    const set = new Set<string>()
    for (const item of resolved) {
      for (const a of item.allergens) set.add(a)
    }
    return Array.from(set).sort()
  }, [resolved])

  const livePanel = useMemo<PanelData | null>(() => {
    if (resolved.length === 0 || servingSizeG <= 0) return null
    const profile = sumNutrients(resolved, servingSizeG)
    const isSupplement = productCategory === 'SUPPLEMENT'
    const order: Array<[keyof NutrientProfilePer100g, string, string | null, number]> = [
      ['calories', 'Calories', null, 0],
      ['totalFat', 'Total Fat', 'g', 0],
      ['saturatedFat', 'Saturated Fat', 'g', 1],
      ['transFat', 'Trans Fat', 'g', 1],
      ['cholesterol', 'Cholesterol', 'mg', 0],
      ['sodium', 'Sodium', 'mg', 0],
      ['totalCarbohydrate', 'Total Carbohydrate', 'g', 0],
      ['dietaryFiber', 'Dietary Fiber', 'g', 1],
      ['totalSugars', 'Total Sugars', 'g', 1],
      ['addedSugars', 'Includes Added Sugars', 'g', 2],
      ['protein', 'Protein', 'g', 0],
      ['vitaminD', 'Vitamin D', 'mcg', 0],
      ['calcium', 'Calcium', 'mg', 0],
      ['iron', 'Iron', 'mg', 0],
      ['potassium', 'Potassium', 'mg', 0],
    ]
    return {
      format: isSupplement ? 'SUPPLEMENT_FACTS' : 'STANDARD',
      servingSize: servingSizeDesc,
      servingsPerContainer: String(servingsPerContainer || '—'),
      rows: order
        .filter(([key]) => !isSupplement || profile[key] !== undefined)
        .map(([key, label, unit, indent]) => {
          const amount = profile[key] ?? 0
          const pct = percentDailyValue(key, amount)
          return {
            id: key,
            label,
            amount: amount === 0 && key !== 'calories' ? 0 : Math.round(amount * 10) / 10,
            unit: unit ?? undefined,
            percentDailyValue: pct ?? undefined,
            indent,
          }
        }),
      requiredFooter: '* % Daily Value based on a 2,000 calorie diet.',
      requiredWarnings: (profile.iron ?? 0) >= 30
        ? [
            'WARNING: Accidental overdose of iron-containing products is a leading cause of fatal poisoning in children under 6. Keep out of reach of children.',
          ]
        : [],
    }
  }, [resolved, servingSizeG, servingsPerContainer, servingSizeDesc, productCategory])

  async function handleSave(intent: 'save' | 'continue') {
    setSaving(true)
    try {
      const result = await saveCustomization({
        productId,
        recipeId,
        ingredients: resolved.map((r, idx) => ({
          ingredientId: r.ingredientId,
          weightG: r.weightG,
          position: idx,
          source: r.source,
          filledSlotId: r.filledSlotId,
        })),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.compliance?.outcome === 'FAILED') {
        toast.error(`Compliance failed: ${result.compliance.violations.length} blocking violation(s)`)
        return
      }
      if (result.complianceError) {
        toast.warning('Saved — compliance service unreachable')
      } else if (result.compliance?.outcome === 'PASSED_WITH_WARNINGS') {
        toast.warning('Saved with warnings')
      } else {
        toast.success('Saved — compliant')
      }
      router.refresh()
      if (intent === 'continue') {
        router.push(`/products/${productId}/design`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,360px]">
      {/* Left column — customizations */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recipe ingredients</CardTitle>
            <CardDescription>
              Locked ingredients stay as-is. Replaceable slots show alternatives in the dropdown.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {slots.map((slot) => {
              const isLocked = !slot.allowReplacement || slot.replacements.length === 0
              return (
                <div key={slot.id} className="rounded-md border border-zinc-200 p-3">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-sm">
                      {slot.label}{' '}
                      <span className="text-xs text-zinc-500">({slot.weightG}g)</span>
                    </Label>
                    {isLocked && (
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                        <Lock className="h-3 w-3" />
                        Locked
                      </span>
                    )}
                  </div>
                  {slot.description && (
                    <p className="mt-1 mb-2 text-xs text-zinc-600">{slot.description}</p>
                  )}
                  {isLocked ? (
                    <div className="rounded bg-zinc-50 px-3 py-2 text-sm">
                      {slot.base.name}
                    </div>
                  ) : (
                    <Select
                      value={slotPicks[slot.id]}
                      onValueChange={(v) => setSlotPicks({ ...slotPicks, [slot.id]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={slot.base.ingredientId}>
                          {slot.base.name} (default)
                        </SelectItem>
                        {slot.replacements.map((r) => (
                          <SelectItem key={r.id} value={r.ingredientId}>
                            {r.name}
                            {r.calloutText && (
                              <span className="ml-2 text-xs text-zinc-500">{r.calloutText}</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {optionals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                Optional add-ons
              </CardTitle>
              <CardDescription>Toggle on to differentiate your product.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {optionals.map((opt) => (
                <label
                  key={opt.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={optionalState[opt.ingredientId] ?? false}
                    onChange={(e) =>
                      setOptionalState({ ...optionalState, [opt.ingredientId]: e.target.checked })
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {opt.name} <span className="text-xs text-zinc-500">+{opt.weightG}g</span>
                    </div>
                    {opt.calloutText && (
                      <div className="mt-0.5 text-xs text-zinc-600">{opt.calloutText}</div>
                    )}
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => handleSave('save')} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button onClick={() => handleSave('continue')} disabled={saving}>
            {saving ? 'Saving…' : 'Continue to design →'}
          </Button>
        </div>
      </div>

      {/* Right column — live preview */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live preview</CardTitle>
            <CardDescription>
              Updates as you customize. Final values come from the compliance check.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {livePanel ? (
              <NutritionFactsRenderer data={livePanel} widthPx={280} />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-md border-2 border-dashed border-zinc-300 text-sm text-zinc-500">
                Configure at least one ingredient.
              </div>
            )}
          </CardContent>
        </Card>

        {liveAllergens.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader>
              <CardTitle className="text-sm">Contains: {liveAllergens.join(', ')}</CardTitle>
              <CardDescription className="text-xs">
                Auto-detected from ingredient choices. Will print on label.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}
