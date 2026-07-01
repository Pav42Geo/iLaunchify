'use client'

// DeclaredPanelPanel — Mode 3 direct panel entry (Slice 4).
// Brief: docs/builds/ingredients-declared-panel-slice-4.md.
//
// Two columns: a form (serving + nutrient grid + ingredient statement +
// allergens + net qty) on the left, a live NutritionFactsRenderer preview on
// the right. Save → declareNutritionPanel (replaces all slots with one synthetic
// "Whole Product" slot + flips nutrientSource=DECLARED). A confirm modal guards
// the slot replacement when the recipe already has ingredients.
//
// The panel is manufacturer-attested, NOT platform-computed — the disclosure
// banner + "Declared by manufacturer" caption are the FDA posture bridge.

import { useMemo, useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { NutritionFactsRenderer } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { FileText, Loader2, X } from 'lucide-react'
import type { PanelData, NutrientRow } from '@ilaunchify/types'
import { declareNutritionPanel, declareFlavorNutritionPanel } from './declared-panel-actions'

interface DeclaredPanelPanelProps {
  productTemplateId: string
  /** Drives Nutrition Facts vs Supplement Facts default. */
  labelingType: string
  /** Existing slot count — triggers the replacement-confirm modal when > 0. */
  existingSlotCount: number
  /** When set, declare the panel for THIS flavor (per-flavor "I already have my
   *  data") instead of the whole product. The synthetic slot + typed panel land
   *  on the FlavorPreset, not the template. */
  flavorPresetId?: string
  /** Flavor name for the per-flavor header/disclosure copy. */
  flavorName?: string
  onSaved: () => void
  onCancel: () => void
}

interface NutrientField {
  id: string
  label: string
  unit?: string
  indent?: 0 | 1 | 2
  /** Calories has no unit + no %DV and renders specially. */
  noDv?: boolean
}

// Standard FDA Nutrition Facts rows (21 CFR 101.9). Supplement Facts reuses the
// same grid in V1 — Supplement-specific vitamin/mineral rows are V1.1.
const NUTRIENT_FIELDS: NutrientField[] = [
  { id: 'calories', label: 'Calories', noDv: true },
  { id: 'totalFat', label: 'Total Fat', unit: 'g' },
  { id: 'saturatedFat', label: 'Saturated Fat', unit: 'g', indent: 1 },
  { id: 'transFat', label: 'Trans Fat', unit: 'g', indent: 1, noDv: true },
  { id: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  { id: 'sodium', label: 'Sodium', unit: 'mg' },
  { id: 'totalCarbohydrate', label: 'Total Carbohydrate', unit: 'g' },
  { id: 'dietaryFiber', label: 'Dietary Fiber', unit: 'g', indent: 1 },
  { id: 'totalSugars', label: 'Total Sugars', unit: 'g', indent: 1, noDv: true },
  { id: 'addedSugars', label: 'Includes Added Sugars', unit: 'g', indent: 2 },
  { id: 'protein', label: 'Protein', unit: 'g', noDv: true },
  { id: 'vitaminD', label: 'Vitamin D', unit: 'mcg' },
  { id: 'calcium', label: 'Calcium', unit: 'mg' },
  { id: 'iron', label: 'Iron', unit: 'mg' },
  { id: 'potassium', label: 'Potassium', unit: 'mg' },
]

const BIG_9 = ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soybeans', 'Sesame']

const DEFAULT_FOOTER =
  'The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.'

export function DeclaredPanelPanel({
  productTemplateId,
  labelingType,
  existingSlotCount,
  flavorPresetId,
  flavorName,
  onSaved,
  onCancel,
}: DeclaredPanelPanelProps) {
  const isFlavor = !!flavorPresetId
  const isSupplement = labelingType === 'SUPPLEMENT'
  const [servingSize, setServingSize] = useState('')
  const [servingsPerContainer, setServingsPerContainer] = useState('')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [dvs, setDvs] = useState<Record<string, string>>({})
  const [ingredientStatement, setIngredientStatement] = useState('')
  const [netQuantity, setNetQuantity] = useState('')
  const [allergens, setAllergens] = useState<string[]>([])
  const [customAllergen, setCustomAllergen] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isSaving, startSave] = useTransition()

  const panel: PanelData = useMemo(() => {
    const rows: NutrientRow[] = NUTRIENT_FIELDS.filter(
      (f) => amounts[f.id] !== undefined && amounts[f.id] !== '',
    ).map((f) => {
      const dvRaw = dvs[f.id]
      return {
        id: f.id,
        label: f.label,
        amount: Number(amounts[f.id]),
        unit: f.unit,
        percentDailyValue: !f.noDv && dvRaw !== undefined && dvRaw !== '' ? Number(dvRaw) : undefined,
        indent: f.indent ?? 0,
      }
    })
    return {
      format: isSupplement ? 'SUPPLEMENT_FACTS' : 'STANDARD',
      rows,
      servingSize: servingSize || '—',
      servingsPerContainer: servingsPerContainer || '—',
      requiredFooter: DEFAULT_FOOTER,
      requiredWarnings: [],
    }
  }, [amounts, dvs, isSupplement, servingSize, servingsPerContainer])

  function toggleAllergen(a: string) {
    setAllergens((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }
  function addCustomAllergen() {
    const v = customAllergen.trim()
    if (v && !allergens.includes(v)) setAllergens((prev) => [...prev, v])
    setCustomAllergen('')
  }

  function doSave() {
    startSave(async () => {
      const args = {
        panel,
        ingredientStatement: ingredientStatement.trim(),
        netQuantity: netQuantity.trim(),
        allergens,
      }
      const res = isFlavor
        ? await declareFlavorNutritionPanel(flavorPresetId!, args)
        : await declareNutritionPanel(productTemplateId, args)
      if (!res.ok) {
        toast.error(
          res.error === 'upgrade-required'
            ? 'Declaring the panel isn’t available on your plan.'
            : 'Could not save the declared panel. Try again.',
        )
        return
      }
      toast.success('Declared panel saved.')
      onSaved()
    })
  }

  function handleSaveClick() {
    if (existingSlotCount > 0) {
      setConfirmOpen(true)
      return
    }
    doSave()
  }

  return (
    <div className="space-y-3 rounded-md border border-pink-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-pink-600" />
        <span className="text-sm font-semibold text-ink-900">
          Declare the {isSupplement ? 'Supplement' : 'Nutrition'} Facts
          {isFlavor && flavorName ? ` — ${flavorName}` : ''}
        </span>
      </div>

      <div className="rounded-md border border-pink-200 bg-pink-50/60 p-2.5 text-[12px] leading-snug text-ink-700">
        <strong className="font-semibold text-ink-900">Entered by you — not computed by iLaunchify.</strong>{' '}
        These values publish as “Declared by manufacturer” on the public detail page. You
        attest to their accuracy (Creator Agreement §3).
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left — form */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Serving size">
              <Input
                value={servingSize}
                onChange={(e) => setServingSize(e.target.value)}
                placeholder="1 can (355 mL)"
                disabled={isSaving}
              />
            </Field>
            <Field label="Servings per container">
              <Input
                value={servingsPerContainer}
                onChange={(e) => setServingsPerContainer(e.target.value)}
                placeholder="12"
                disabled={isSaving}
              />
            </Field>
          </div>

          <div>
            <div className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">
              Per serving
            </div>
            <div className="space-y-1">
              {NUTRIENT_FIELDS.map((f) => (
                <div
                  key={f.id}
                  className="grid grid-cols-[1fr_80px_64px] items-center gap-2"
                  style={{ paddingLeft: (f.indent ?? 0) * 12 }}
                >
                  <span className="text-[12.5px] text-ink-700">
                    {f.label}
                    {f.unit && <span className="text-ink-400"> ({f.unit})</span>}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={amounts[f.id] ?? ''}
                    onChange={(e) => setAmounts((p) => ({ ...p, [f.id]: e.target.value }))}
                    placeholder="0"
                    disabled={isSaving}
                    className="h-8"
                  />
                  {f.noDv ? (
                    <span className="text-center text-[10px] text-ink-300">—</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      value={dvs[f.id] ?? ''}
                      onChange={(e) => setDvs((p) => ({ ...p, [f.id]: e.target.value }))}
                      placeholder="%DV"
                      disabled={isSaving}
                      className="h-8"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <Field label="Ingredient statement">
            <textarea
              value={ingredientStatement}
              onChange={(e) => setIngredientStatement(e.target.value)}
              rows={3}
              placeholder="Carbonated water, cane sugar, mango purée, citric acid, natural flavor."
              disabled={isSaving}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-pink-400 focus:outline-none"
            />
          </Field>

          <div>
            <div className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">
              Contains (allergens)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BIG_9.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAllergen(a)}
                  disabled={isSaving}
                  className={
                    'rounded-pill border px-2.5 py-0.5 text-[11px] font-medium transition-colors ' +
                    (allergens.includes(a)
                      ? 'border-warning-300 bg-warning-100 text-warning-900'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-warning-300')
                  }
                >
                  {a}
                </button>
              ))}
              {allergens
                .filter((a) => !BIG_9.includes(a))
                .map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAllergen(a)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 rounded-pill border border-warning-300 bg-warning-100 px-2.5 py-0.5 text-[11px] font-medium text-warning-900"
                  >
                    {a} <X className="h-2.5 w-2.5" />
                  </button>
                ))}
            </div>
            <div className="mt-1.5 flex gap-2">
              <Input
                value={customAllergen}
                onChange={(e) => setCustomAllergen(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomAllergen()
                  }
                }}
                placeholder="Add another…"
                disabled={isSaving}
                className="h-8 max-w-[200px]"
              />
              <Button variant="outline" size="sm" onClick={addCustomAllergen} disabled={isSaving}>
                Add
              </Button>
            </div>
          </div>

          <Field label="Net quantity">
            <Input
              value={netQuantity}
              onChange={(e) => setNetQuantity(e.target.value)}
              placeholder="12 fl oz (355 mL)"
              disabled={isSaving}
              className="max-w-[220px]"
            />
          </Field>
        </div>

        {/* Right — live preview */}
        <div className="lg:justify-self-end">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-700">
            Live preview
          </div>
          <NutritionFactsRenderer data={panel} widthPx={300} declaredByManufacturer />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSaveClick}
          disabled={isSaving}
          className="bg-ink-900 text-white hover:bg-ink-700"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            'Save declared panel'
          )}
        </Button>
      </div>

      {/* Replace-slots confirmation */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-ink-900">Switch to a declared panel?</h3>
            <p className="mt-2 text-sm text-ink-600">
              You currently have {existingSlotCount} ingredient slot
              {existingSlotCount === 1 ? '' : 's'}. Saving will replace them with a single
              declared panel based on your typed values. You can switch back to Search &amp;
              build later, but your existing ingredients won’t be restored automatically.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setConfirmOpen(false)
                  doSave()
                }}
                disabled={isSaving}
                className="bg-ink-900 text-white hover:bg-ink-700"
              >
                Switch and continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-ui-label text-ink-700">{label}</Label>
      {children}
    </div>
  )
}
