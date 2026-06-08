'use client'

// Turnkey "new product" flow — the single entry point for partner product
// creation (2026-06-07). Replaces the old Blank/Clone/Starter chooser +
// emerald-themed NewProductStepper. Mood-board styling (pink #FF2E63 / pink-700
// / ink + black-pill CTAs — no green).
//
// Four steps, gated by the partner's turnkey service scope:
//   1. Basics    — name + category + subcategory (drives the FDA rule pack)
//   2. Recipe    — ≥1 base ingredient via the unified IngredientPicker
//   3. Packaging — ≥1 packaging system from the partner's ACTIVE catalog
//   4. Pricing   — base price + container/serving specs
//
// On finish it calls the SAME createDraftFromStepper action the old stepper
// used (one transaction: template + slots + packaging links + default variant),
// then hands off to /products/[id]/edit for deep authoring (recipe builder,
// allergens, label, media, certificates).

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input, Label } from '@ilaunchify/ui'
import { ArrowLeft, ArrowRight, Check, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createDraftFromStepper, type StepperIngredient } from '../actions'
import { IngredientPicker } from '../[id]/edit/cards/IngredientPicker'
import type { IngredientResult } from '../[id]/edit/ingredient-actions'

interface CategoryOption {
  id: string
  name: string
  mainCategory: string
}
interface SubcategoryOption {
  id: string
  name: string
  categoryId: string
}
interface PackagingOption {
  id: string
  partnerName: string
  topology: string
  unitCount: number
  moq: number
}

interface TurnkeyProductFlowProps {
  categories: CategoryOption[]
  subcategories: SubcategoryOption[]
  packagingSystems: PackagingOption[]
}

interface FlowState {
  name: string
  categoryId: string
  subcategoryId: string
  ingredients: StepperIngredient[]
  packagingSystemIds: string[]
  priceFloorDollars: string
  containerFormat: string
  servingsPerContainer: string
  servingSizeG: string
}

const BLANK: FlowState = {
  name: '',
  categoryId: '',
  subcategoryId: '',
  ingredients: [],
  packagingSystemIds: [],
  priceFloorDollars: '',
  containerFormat: '',
  servingsPerContainer: '30',
  servingSizeG: '30',
}

type StepId = 1 | 2 | 3 | 4
const STEPS = [
  { id: 1, label: 'Basics', sub: 'Name + category' },
  { id: 2, label: 'Recipe', sub: 'Base ingredients' },
  { id: 3, label: 'Packaging', sub: 'How it ships' },
  { id: 4, label: 'Pricing', sub: 'Price + container' },
] as const

export function TurnkeyProductFlow({
  categories,
  subcategories,
  packagingSystems,
}: TurnkeyProductFlowProps) {
  const router = useRouter()
  const [activeStep, setActiveStep] = useState<StepId>(1)
  const [state, setState] = useState<FlowState>(BLANK)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function patch<K extends keyof FlowState>(key: K, value: FlowState[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  const filteredSubcategories = useMemo(
    () => subcategories.filter((s) => s.categoryId === state.categoryId),
    [state.categoryId, subcategories],
  )

  const gates: Record<StepId, { ok: boolean; reason: string | null }> = {
    1: validateStep1(state),
    2: validateStep2(state),
    3: validateStep3(state),
    4: validateStep4(state),
  }
  const canAdvance = gates[activeStep].ok
  const allValid = gates[1].ok && gates[2].ok && gates[3].ok && gates[4].ok

  function handleFinish() {
    setError(null)
    startTransition(async () => {
      const priceCents = Math.round(parseFloat(state.priceFloorDollars) * 100)
      const result = await createDraftFromStepper({
        name: state.name,
        subcategoryId: state.subcategoryId,
        ingredients: state.ingredients.filter(
          (i) => (i.ingredientId || i.name.trim()) && i.weightG > 0,
        ),
        packagingSystemIds: state.packagingSystemIds,
        priceFloorCents: Number.isFinite(priceCents) ? priceCents : 0,
        containerFormat: state.containerFormat,
        servingsPerContainer: parseInt(state.servingsPerContainer, 10) || 1,
        servingSizeG: parseFloat(state.servingSizeG) || 30,
      })
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(`Draft "${state.name}" created`)
      router.push(`/products/${result.data.id}/edit`)
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px,1fr]">
      {/* Step nav — mood board */}
      <nav aria-label="Steps">
        <ol className="space-y-1">
          {STEPS.map((s) => {
            const done = gates[s.id].ok && s.id < activeStep
            const current = s.id === activeStep
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveStep(s.id)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                    current ? 'bg-[#FBEAF0] ring-1 ring-[#F4C0D1]' : 'hover:bg-ink-50'
                  }`}
                  aria-current={current ? 'step' : undefined}
                >
                  <StepIndicator n={s.id} done={done} current={current} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink-900">{s.label}</div>
                    <div className="text-xs text-ink-500">{s.sub}</div>
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Step body */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        {activeStep === 1 && (
          <Step1
            state={state}
            patch={patch}
            categories={categories}
            subcategories={filteredSubcategories}
          />
        )}
        {activeStep === 2 && <Step2 state={state} patch={patch} />}
        {activeStep === 3 && <Step3 state={state} patch={patch} packagingSystems={packagingSystems} />}
        {activeStep === 4 && <Step4 state={state} patch={patch} />}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
          <button
            type="button"
            onClick={() => setActiveStep((s) => (s > 1 ? ((s - 1) as StepId) : s))}
            disabled={activeStep === 1 || isPending}
            className="inline-flex items-center rounded-full px-3 py-2 text-[13px] font-medium text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" /> Back
          </button>
          <div className="flex items-center gap-3">
            {!canAdvance && gates[activeStep].reason && (
              <p className="text-xs text-amber-700">{gates[activeStep].reason}</p>
            )}
            {activeStep < 4 ? (
              <button
                type="button"
                onClick={() => setActiveStep((s) => (s < 4 ? ((s + 1) as StepId) : s))}
                disabled={!canAdvance || isPending}
                className="inline-flex items-center rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:bg-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                Next <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={!allValid || isPending}
                className="inline-flex items-center rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:bg-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                {isPending ? 'Creating…' : 'Create draft & open editor'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Step 1 — Basics
// -----------------------------------------------------------------------------

function Step1({
  state,
  patch,
  categories,
  subcategories,
}: {
  state: FlowState
  patch: <K extends keyof FlowState>(k: K, v: FlowState[K]) => void
  categories: CategoryOption[]
  subcategories: SubcategoryOption[]
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">What is it?</h2>

      <Field label="Product name" required>
        <Input
          value={state.name}
          onChange={(e) => patch('name', e.target.value)}
          placeholder="e.g. Whey Protein Powder"
          maxLength={120}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" required>
          <select
            value={state.categoryId}
            onChange={(e) => {
              patch('categoryId', e.target.value)
              patch('subcategoryId', '')
            }}
            className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.mainCategory})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subcategory" required>
          <select
            value={state.subcategoryId}
            onChange={(e) => patch('subcategoryId', e.target.value)}
            disabled={!state.categoryId}
            className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-ink-50 disabled:text-ink-400"
          >
            <option value="">{state.categoryId ? 'Select…' : 'Pick a category first'}</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="rounded-lg bg-pink-50 px-3 py-2 text-xs text-pink-700">
        The subcategory selects the right FDA rule pack — Food, Supplement, and Pet labels each
        have different requirements. It also locks the panel type in the editor so you can&apos;t
        ship a mismatched Facts panel.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Step 2 — Recipe
// -----------------------------------------------------------------------------

const SOURCE_CHIP: Record<string, { label: string; cls: string }> = {
  USDA: { label: 'USDA', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  LIBRARY: { label: 'Library', cls: 'bg-pink-50 text-pink-700 ring-pink-200' },
  PARTNER_PRIVATE: { label: 'Private', cls: 'bg-ink-100 text-ink-600 ring-ink-200' },
}

function Step2({
  state,
  patch,
}: {
  state: FlowState
  patch: <K extends keyof FlowState>(k: K, v: FlowState[K]) => void
}) {
  function addPicked(ing: IngredientResult) {
    if (state.ingredients.some((r) => r.ingredientId === ing.id)) {
      toast.error(`${ing.internalName} is already in the recipe.`)
      return
    }
    patch('ingredients', [
      ...state.ingredients,
      { ingredientId: ing.id, name: ing.internalName, weightG: 0, source: ing.source },
    ])
  }
  function removeRow(i: number) {
    patch('ingredients', state.ingredients.filter((_, idx) => idx !== i))
  }
  function updateGrams(i: number, value: string) {
    const next = [...state.ingredients]
    next[i] = { ...next[i]!, weightG: parseFloat(value) || 0 }
    patch('ingredients', next)
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">What goes in it?</h2>
      <p className="-mt-3 text-sm text-ink-500">
        Search USDA, the iLaunchify library, and your own ingredients — picked rows bring real
        nutrition + allergen data with them, so the label calculates from minute one. Can&apos;t
        find it? Add a private ingredient right from the search.
      </p>

      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-ink-500">Add an ingredient</Label>
        <IngredientPicker
          onPick={addPicked}
          placeholder="Search e.g. whey protein concentrate…"
          autoFocus={state.ingredients.length === 0}
        />
      </div>

      {state.ingredients.length > 0 && (
        <ul className="space-y-2">
          {state.ingredients.map((ing, i) => {
            const chip = ing.source ? SOURCE_CHIP[ing.source] : undefined
            return (
              <li
                key={ing.ingredientId ?? `${ing.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{ing.name}</p>
                  {chip && (
                    <span
                      className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${chip.cls}`}
                    >
                      {chip.label}
                    </span>
                  )}
                </div>
                <div className="w-28">
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={ing.weightG || ''}
                    onChange={(e) => updateGrams(i, e.target.value)}
                    placeholder="grams"
                    aria-label={`${ing.name} weight in grams`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  aria-label={`Remove ${ing.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="rounded-lg bg-pink-50 px-3 py-2 text-xs text-pink-700">
        Each ingredient becomes a slot the creator can optionally swap alternatives into (e.g. monk
        fruit instead of sugar). You set up replaceables, optionals, and flavor presets in the
        editor&apos;s recipe builder.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Step 3 — Packaging
// -----------------------------------------------------------------------------

function Step3({
  state,
  patch,
  packagingSystems,
}: {
  state: FlowState
  patch: <K extends keyof FlowState>(k: K, v: FlowState[K]) => void
  packagingSystems: PackagingOption[]
}) {
  function toggle(id: string) {
    const next = state.packagingSystemIds.includes(id)
      ? state.packagingSystemIds.filter((x) => x !== id)
      : [...state.packagingSystemIds, id]
    patch('packagingSystemIds', next)
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">How does it ship?</h2>
      <p className="-mt-3 text-sm text-ink-500">
        Pick the packaging configurations creators can order in. Each one has its own per-size
        price you can tune in the editor.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {packagingSystems.map((p) => {
          const selected = state.packagingSystemIds.includes(p.id)
          return (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                selected
                  ? 'border-pink-500 bg-pink-50'
                  : 'border-ink-200 bg-white hover:bg-ink-50'
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(p.id)}
                className="mt-1 accent-pink-600"
              />
              <div className="min-w-0">
                <div className="font-medium text-ink-900">{p.partnerName}</div>
                <div className="mt-0.5 text-xs text-ink-500">
                  {humanizeTopology(p.topology)} · {p.unitCount} unit
                  {p.unitCount === 1 ? '' : 's'} per pack · MOQ {p.moq.toLocaleString()}
                </div>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Step 4 — Pricing
// -----------------------------------------------------------------------------

function Step4({
  state,
  patch,
}: {
  state: FlowState
  patch: <K extends keyof FlowState>(k: K, v: FlowState[K]) => void
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">What does it cost?</h2>
      <p className="-mt-3 text-sm text-ink-500">
        Set the base unit price + container specs. The editor lets you add per-size pricing tiers
        and per-flavor variants later.
      </p>

      <Field label="Base unit price (USD)" required>
        <div className="flex max-w-xs items-stretch overflow-hidden rounded-md border border-ink-300">
          <span className="flex items-center bg-ink-50 px-3 text-sm text-ink-500">$</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={state.priceFloorDollars}
            onChange={(e) => patch('priceFloorDollars', e.target.value)}
            placeholder="3.50"
            className="block w-full bg-white px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <p className="mt-1 text-xs text-ink-500">
          Per-unit cost to the creator at base MOQ. Volume tier discounts come later.
        </p>
      </Field>

      <Field
        label="Container format"
        required
        hint='Free-form description: "16oz wide-mouth jar", "60ct bottle"'
      >
        <Input
          value={state.containerFormat}
          onChange={(e) => patch('containerFormat', e.target.value)}
          placeholder="e.g. 16oz jar"
        />
      </Field>

      <div className="grid max-w-md gap-4 sm:grid-cols-2">
        <Field label="Servings per container">
          <Input
            type="number"
            min={1}
            value={state.servingsPerContainer}
            onChange={(e) => patch('servingsPerContainer', e.target.value)}
          />
        </Field>
        <Field label="Serving size (grams)">
          <Input
            type="number"
            min={1}
            step={0.1}
            value={state.servingSizeG}
            onChange={(e) => patch('servingSizeG', e.target.value)}
          />
        </Field>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-ink-900">
        {label}
        {required && (
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-pink-700">
            Required
          </span>
        )}
      </Label>
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
      {children}
    </div>
  )
}

function StepIndicator({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FF2E63] text-white">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    )
  }
  return (
    <span
      className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        current ? 'bg-ink-900 text-white' : 'border border-ink-300 bg-white text-ink-700'
      }`}
    >
      {n}
    </span>
  )
}

function validateStep1(s: FlowState): { ok: boolean; reason: string | null } {
  if (!s.name.trim() || s.name.trim().length < 2) return { ok: false, reason: 'Name is required.' }
  if (!s.subcategoryId) return { ok: false, reason: 'Pick a category + subcategory.' }
  return { ok: true, reason: null }
}
function validateStep2(s: FlowState): { ok: boolean; reason: string | null } {
  const valid = s.ingredients.filter((i) => (i.ingredientId || i.name.trim()) && i.weightG > 0)
  if (valid.length === 0) return { ok: false, reason: 'Add at least one ingredient with grams.' }
  return { ok: true, reason: null }
}
function validateStep3(s: FlowState): { ok: boolean; reason: string | null } {
  if (s.packagingSystemIds.length === 0) {
    return { ok: false, reason: 'Pick at least one packaging system.' }
  }
  return { ok: true, reason: null }
}
function validateStep4(s: FlowState): { ok: boolean; reason: string | null } {
  const price = parseFloat(s.priceFloorDollars)
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: 'Set a base price greater than $0.' }
  }
  if (!s.containerFormat.trim()) return { ok: false, reason: 'Describe the container.' }
  return { ok: true, reason: null }
}

function humanizeTopology(t: string): string {
  return t
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
