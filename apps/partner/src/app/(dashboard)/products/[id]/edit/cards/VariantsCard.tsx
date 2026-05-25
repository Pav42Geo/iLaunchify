'use client'

// Variants editor card — per-SKU container/serving/MOQ/lead-time/cost.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 (⑤ Pricing) + #131.
//
// V1 ships per-variant CRUD. Per-tier volume pricing (FOD parity) lives on
// ProductTemplatePackaging.pricingTiers — that's a separate per-size price
// table managed in #132 (Packaging card).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronDown, Package } from 'lucide-react'
import { addVariant, updateVariant, removeVariant, type AddVariantInput } from '../card-actions'

export interface VariantRow {
  id: string
  flavor: string | null
  containerFormat: string
  containerSizeG: number | null
  servingsPerContainer: number
  servingSizeG: number
  servingSizeDesc: string | null
  moqMin: number
  moqMax: number
  leadTimeDays: number
  unitCostCentsOverride: number | null
}

interface VariantsCardProps {
  productTemplateId: string
  initialVariants: VariantRow[]
  isDraft: boolean
}

export function VariantsCard({ productTemplateId, initialVariants, isDraft }: VariantsCardProps) {
  const router = useRouter()
  const [variants, setVariants] = useState<VariantRow[]>(initialVariants)
  const [showAdd, setShowAdd] = useState(false)

  function refresh() {
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {variants.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          No variants yet. Add at least one container size before submitting.
        </div>
      ) : (
        <ul className="space-y-2">
          {variants.map((v) => (
            <VariantItem
              key={v.id}
              variant={v}
              isDraft={isDraft}
              canRemove={variants.length > 1}
              onChange={refresh}
              onLocalUpdate={(patch) =>
                setVariants((prev) => prev.map((row) => (row.id === v.id ? { ...row, ...patch } : row)))
              }
              onLocalRemove={() => setVariants((prev) => prev.filter((row) => row.id !== v.id))}
            />
          ))}
        </ul>
      )}

      {showAdd ? (
        <AddVariantForm
          productTemplateId={productTemplateId}
          onCancel={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            refresh()
          }}
        />
      ) : isDraft ? (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add variant
        </Button>
      ) : null}

      <p className="text-xs text-zinc-500">
        💡 One variant per SKU — different container size or flavor = different variant.
        Per-size volume tier pricing lives on the Packaging card.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// One variant row — collapsible header + expanded editor
// -----------------------------------------------------------------------------

function VariantItem({
  variant,
  isDraft,
  canRemove,
  onChange,
  onLocalUpdate,
  onLocalRemove,
}: {
  variant: VariantRow
  isDraft: boolean
  canRemove: boolean
  onChange: () => void
  onLocalUpdate: (patch: Partial<VariantRow>) => void
  onLocalRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Local edit state
  const [flavor, setFlavor] = useState(variant.flavor ?? '')
  const [containerFormat, setContainerFormat] = useState(variant.containerFormat)
  const [servings, setServings] = useState(String(variant.servingsPerContainer))
  const [servingSize, setServingSize] = useState(String(variant.servingSizeG))
  const [servingDesc, setServingDesc] = useState(variant.servingSizeDesc ?? '')
  const [containerSize, setContainerSize] = useState(
    variant.containerSizeG != null ? String(variant.containerSizeG) : '',
  )
  const [moqMin, setMoqMin] = useState(String(variant.moqMin))
  const [moqMax, setMoqMax] = useState(String(variant.moqMax))
  const [leadTimeDays, setLeadTimeDays] = useState(String(variant.leadTimeDays))
  const [costOverride, setCostOverride] = useState(
    variant.unitCostCentsOverride != null ? (variant.unitCostCentsOverride / 100).toFixed(2) : '',
  )

  function commit(field: string) {
    return () => {
      const patch: Parameters<typeof updateVariant>[0]['patch'] = {}
      if (field === 'flavor') patch.flavor = flavor || null
      if (field === 'containerFormat') {
        if (!containerFormat.trim()) {
          toast.error('Container format is required.')
          setContainerFormat(variant.containerFormat)
          return
        }
        patch.containerFormat = containerFormat
      }
      if (field === 'servings') {
        const n = parseInt(servings, 10)
        if (!Number.isFinite(n) || n < 1) {
          toast.error('Servings must be ≥ 1.')
          setServings(String(variant.servingsPerContainer))
          return
        }
        patch.servingsPerContainer = n
      }
      if (field === 'servingSize') {
        const n = parseFloat(servingSize)
        if (!Number.isFinite(n) || n <= 0) {
          toast.error('Serving size must be > 0g.')
          setServingSize(String(variant.servingSizeG))
          return
        }
        patch.servingSizeG = n
      }
      if (field === 'servingDesc') patch.servingSizeDesc = servingDesc || null
      if (field === 'containerSize') {
        patch.containerSizeG = containerSize ? parseFloat(containerSize) : null
      }
      if (field === 'moq') {
        const min = parseInt(moqMin, 10)
        const max = parseInt(moqMax, 10)
        if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) {
          toast.error('MOQ range invalid (min ≥ 1, max ≥ min).')
          setMoqMin(String(variant.moqMin))
          setMoqMax(String(variant.moqMax))
          return
        }
        patch.moqMin = min
        patch.moqMax = max
      }
      if (field === 'leadTimeDays') {
        const n = parseInt(leadTimeDays, 10)
        if (!Number.isFinite(n) || n < 0) {
          toast.error('Lead time must be ≥ 0.')
          setLeadTimeDays(String(variant.leadTimeDays))
          return
        }
        patch.leadTimeDays = n
      }
      if (field === 'costOverride') {
        if (!costOverride.trim()) {
          patch.unitCostCentsOverride = null
        } else {
          const dollars = parseFloat(costOverride)
          if (!Number.isFinite(dollars) || dollars < 0) {
            toast.error('Cost override must be ≥ 0.')
            return
          }
          patch.unitCostCentsOverride = Math.round(dollars * 100)
        }
      }
      if (Object.keys(patch).length === 0) return
      startTransition(async () => {
        const result = await updateVariant({ variantId: variant.id, patch })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        onLocalUpdate(patch as Partial<VariantRow>)
      })
    }
  }

  function remove() {
    if (!canRemove) {
      toast.error('Templates need at least one variant.')
      return
    }
    if (!confirm(`Remove "${variant.containerFormat}"?`)) return
    startTransition(async () => {
      const result = await removeVariant(variant.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onLocalRemove()
    })
  }

  return (
    <li className="rounded-md border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <Package className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-900">{variant.containerFormat}</span>
            {variant.flavor && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                {variant.flavor}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500">
            <span>
              {variant.servingsPerContainer} × {variant.servingSizeG}g servings
            </span>
            <span>
              MOQ {variant.moqMin.toLocaleString()}–{variant.moqMax.toLocaleString()}
            </span>
            <span>{variant.leadTimeDays}d lead</span>
            {variant.unitCostCentsOverride != null && (
              <span>cost ${(variant.unitCostCentsOverride / 100).toFixed(2)}</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-zinc-100 bg-zinc-50/30 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Container format" required>
              <Input
                value={containerFormat}
                onChange={(e) => setContainerFormat(e.target.value)}
                onBlur={commit('containerFormat')}
                disabled={!isDraft || isPending}
              />
            </Field>
            <Field label="Flavor (blank for unflavored / multi)">
              <Input
                value={flavor}
                onChange={(e) => setFlavor(e.target.value)}
                onBlur={commit('flavor')}
                placeholder="e.g. Vanilla"
                disabled={!isDraft || isPending}
              />
            </Field>
            <Field label="Servings per container">
              <Input
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                onBlur={commit('servings')}
                disabled={!isDraft || isPending}
              />
            </Field>
            <Field label="Serving size (grams)">
              <Input
                type="number"
                min={0}
                step={0.1}
                value={servingSize}
                onChange={(e) => setServingSize(e.target.value)}
                onBlur={commit('servingSize')}
                disabled={!isDraft || isPending}
              />
            </Field>
            <Field label="Serving size description" hint='Free-form, e.g. "1 scoop (30g)"'>
              <Input
                value={servingDesc}
                onChange={(e) => setServingDesc(e.target.value)}
                onBlur={commit('servingDesc')}
                placeholder="1 scoop (30g)"
                disabled={!isDraft || isPending}
              />
            </Field>
            <Field label="Container size (g)" hint="Total contents weight">
              <Input
                type="number"
                min={0}
                step={0.1}
                value={containerSize}
                onChange={(e) => setContainerSize(e.target.value)}
                onBlur={commit('containerSize')}
                disabled={!isDraft || isPending}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2 sm:col-span-1">
              <Field label="MOQ min">
                <Input
                  type="number"
                  min={1}
                  value={moqMin}
                  onChange={(e) => setMoqMin(e.target.value)}
                  onBlur={commit('moq')}
                  disabled={!isDraft || isPending}
                />
              </Field>
              <Field label="MOQ max">
                <Input
                  type="number"
                  min={1}
                  value={moqMax}
                  onChange={(e) => setMoqMax(e.target.value)}
                  onBlur={commit('moq')}
                  disabled={!isDraft || isPending}
                />
              </Field>
            </div>
            <Field label="Lead time (days)">
              <Input
                type="number"
                min={0}
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                onBlur={commit('leadTimeDays')}
                disabled={!isDraft || isPending}
              />
            </Field>
            <Field label="Per-variant cost override (USD)" hint="Blank uses ProductTemplate.unitCostCents">
              <div className="flex items-stretch overflow-hidden rounded-md border border-zinc-300">
                <span className="flex items-center bg-zinc-50 px-3 text-xs text-zinc-500">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={costOverride}
                  onChange={(e) => setCostOverride(e.target.value)}
                  onBlur={commit('costOverride')}
                  className="block w-full bg-white px-3 py-2 text-sm focus:outline-none"
                  disabled={!isDraft || isPending}
                />
              </div>
            </Field>
          </div>

          {isDraft && canRemove && (
            <div className="flex justify-end border-t border-zinc-100 pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={remove}
                disabled={isPending}
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove variant
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// -----------------------------------------------------------------------------
// Add variant form
// -----------------------------------------------------------------------------

function AddVariantForm({
  productTemplateId,
  onCancel,
  onAdded,
}: {
  productTemplateId: string
  onCancel: () => void
  onAdded: () => void
}) {
  const [flavor, setFlavor] = useState('')
  const [containerFormat, setContainerFormat] = useState('')
  const [servings, setServings] = useState('30')
  const [servingSize, setServingSize] = useState('30')
  const [moqMin, setMoqMin] = useState('500')
  const [moqMax, setMoqMax] = useState('5000')
  const [leadTimeDays, setLeadTimeDays] = useState('28')
  const [isPending, startTransition] = useTransition()

  function add() {
    const input: AddVariantInput = {
      productTemplateId,
      flavor: flavor || null,
      containerFormat,
      containerSizeG: null,
      servingsPerContainer: parseInt(servings, 10) || 1,
      servingSizeG: parseFloat(servingSize) || 0,
      servingSizeDesc: null,
      moqMin: parseInt(moqMin, 10) || 1,
      moqMax: parseInt(moqMax, 10) || 1,
      leadTimeDays: parseInt(leadTimeDays, 10) || 0,
      unitCostCentsOverride: null,
    }
    startTransition(async () => {
      const result = await addVariant(input)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onAdded()
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Container format" required>
          <Input
            value={containerFormat}
            onChange={(e) => setContainerFormat(e.target.value)}
            placeholder="e.g. 16oz jar"
            disabled={isPending}
          />
        </Field>
        <Field label="Flavor (optional)">
          <Input
            value={flavor}
            onChange={(e) => setFlavor(e.target.value)}
            placeholder="e.g. Vanilla"
            disabled={isPending}
          />
        </Field>
        <Field label="Servings">
          <Input
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            disabled={isPending}
          />
        </Field>
        <Field label="Serving size (g)">
          <Input
            type="number"
            min={0}
            step={0.1}
            value={servingSize}
            onChange={(e) => setServingSize(e.target.value)}
            disabled={isPending}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="MOQ min">
            <Input
              type="number"
              min={1}
              value={moqMin}
              onChange={(e) => setMoqMin(e.target.value)}
              disabled={isPending}
            />
          </Field>
          <Field label="MOQ max">
            <Input
              type="number"
              min={1}
              value={moqMax}
              onChange={(e) => setMoqMax(e.target.value)}
              disabled={isPending}
            />
          </Field>
        </div>
        <Field label="Lead time (days)">
          <Input
            type="number"
            min={0}
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            disabled={isPending}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={add}
          disabled={isPending || !containerFormat.trim()}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {isPending ? 'Adding…' : 'Add variant'}
        </Button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Field helper
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
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
        {required && (
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-red-600">
            *
          </span>
        )}
      </Label>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
      {children}
    </div>
  )
}
