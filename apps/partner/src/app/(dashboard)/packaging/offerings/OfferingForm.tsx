'use client'

// Slice C8 — create/edit form for a PartnerPackagingOffering.
// Used by /packaging/offerings/new (create) and /packaging/offerings/[id] (edit).
//
// Flow: pick service → pick container type → decoration (filtered to the
// methods compatible with that type's category) → MOQ → lead time → fulfillment
// mode → repeatable pricing tiers ([{minQty, pricePerUnitCents}], ≥1) → status.
// In edit mode the type + decoration are locked (they form the unique key).

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import type {
  DecorationMethod,
  FulfillmentMode,
  OfferingStatus,
} from '@ilaunchify/db'
import {
  DECORATION_LABELS,
  FULFILLMENT_OPTIONS,
  STATUS_OPTIONS,
  type PricingTier,
} from './constants'
import { createPackagingOffering, updatePackagingOffering } from './offering-actions'
import type { DielineOption } from '../dielines/data'

export interface ServiceOption {
  id: string
  label: string
}

export interface PackagingTypeOption {
  id: string
  displayName: string
  containerCategoryLabel: string | null
  /** Methods with an active compatibility row for this type's category. */
  compatibleMethods: DecorationMethod[]
}

interface TierRow {
  minQty: string
  pricePerUnit: string // dollars in the input; converted to cents on submit
}

interface OfferingFormProps {
  mode: 'create' | 'edit'
  services: ServiceOption[]
  packagingTypes: PackagingTypeOption[]
  /** Partner's offering-eligible dielines (ACTIVE / PARTNER_CONFIRMED). */
  dielines: DielineOption[]
  offeringId?: string
  initial?: {
    partnerServiceId: string
    packagingTypeId: string
    decorationMethod: DecorationMethod
    moq: number
    leadTimeDays: number
    fulfillmentMode: FulfillmentMode
    status: OfferingStatus
    pricingTiers: PricingTier[]
    dielineId: string | null
  }
}

const BLANK_TIER: TierRow = { minQty: '1', pricePerUnit: '' }

export function OfferingForm({
  mode,
  services,
  packagingTypes,
  dielines,
  offeringId,
  initial,
}: OfferingFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [partnerServiceId, setPartnerServiceId] = useState(
    initial?.partnerServiceId ?? services[0]?.id ?? '',
  )
  const [packagingTypeId, setPackagingTypeId] = useState(initial?.packagingTypeId ?? '')
  const [decorationMethod, setDecorationMethod] = useState<DecorationMethod | ''>(
    initial?.decorationMethod ?? '',
  )
  const [moq, setMoq] = useState(String(initial?.moq ?? '500'))
  const [leadTimeDays, setLeadTimeDays] = useState(String(initial?.leadTimeDays ?? '14'))
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode>(
    initial?.fulfillmentMode ?? 'BOTH',
  )
  const [status, setStatus] = useState<OfferingStatus>(initial?.status ?? 'DRAFT')
  const [dielineId, setDielineId] = useState(initial?.dielineId ?? '')
  const [tiers, setTiers] = useState<TierRow[]>(
    initial?.pricingTiers?.length
      ? initial.pricingTiers.map((t) => ({
          minQty: String(t.minQty),
          pricePerUnit: (t.pricePerUnitCents / 100).toFixed(2),
        }))
      : [{ ...BLANK_TIER }],
  )

  const selectedType = useMemo(
    () => packagingTypes.find((t) => t.id === packagingTypeId) ?? null,
    [packagingTypes, packagingTypeId],
  )

  // Decoration options narrow to the chosen type's compatible methods.
  const decorationOptions: DecorationMethod[] = selectedType?.compatibleMethods ?? []

  // Dieline dropdown: only the partner's dielines that match BOTH the chosen
  // container type and decoration method (plus a "— none —" option). Empties out
  // until both are picked, which keeps a partner from binding a mismatched cut.
  const eligibleDielines = useMemo(() => {
    if (!packagingTypeId || !decorationMethod) return []
    return dielines.filter(
      (d) => d.packagingTypeId === packagingTypeId && d.decorationMethod === decorationMethod,
    )
  }, [dielines, packagingTypeId, decorationMethod])

  function onTypeChange(id: string) {
    setPackagingTypeId(id)
    const next = packagingTypes.find((t) => t.id === id)
    // Clear an incompatible decoration when the type changes.
    if (decorationMethod && next && !next.compatibleMethods.includes(decorationMethod)) {
      setDecorationMethod('')
    }
    // A bound dieline is type+decoration specific — drop it when the type changes.
    setDielineId('')
  }

  function onDecorationChange(m: DecorationMethod | '') {
    setDecorationMethod(m)
    // Drop a bound dieline that no longer matches the decoration.
    setDielineId('')
  }

  function updateTier(i: number, key: keyof TierRow, value: string) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)))
  }
  function addTier() {
    setTiers((prev) => [...prev, { ...BLANK_TIER }])
  }
  function removeTier(i: number) {
    setTiers((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!partnerServiceId) return setError('Pick a service.')
    if (mode === 'create' && !packagingTypeId) return setError('Pick a container type.')
    if (mode === 'create' && !decorationMethod) return setError('Pick a decoration method.')

    const pricingTiers: PricingTier[] = []
    for (const t of tiers) {
      const minQty = parseInt(t.minQty, 10)
      const dollars = parseFloat(t.pricePerUnit)
      if (!Number.isInteger(minQty) || minQty < 1) {
        return setError('Every tier needs a whole-number min quantity of 1 or more.')
      }
      if (!Number.isFinite(dollars) || dollars <= 0) {
        return setError('Every tier needs a price per unit greater than $0.')
      }
      pricingTiers.push({ minQty, pricePerUnitCents: Math.round(dollars * 100) })
    }

    startTransition(async () => {
      if (mode === 'create') {
        const result = await createPackagingOffering({
          partnerServiceId,
          packagingTypeId,
          decorationMethod: decorationMethod as DecorationMethod,
          moq: parseInt(moq, 10) || 1,
          leadTimeDays: parseInt(leadTimeDays, 10) || 0,
          fulfillmentMode,
          pricingTiers,
          status,
          dielineId: dielineId.trim() || null,
        })
        if (!result.ok) return setError(result.error)
        toast.success('Offering created')
        router.push('/packaging/offerings')
        router.refresh()
      } else if (offeringId) {
        const result = await updatePackagingOffering(offeringId, {
          moq: parseInt(moq, 10) || 1,
          leadTimeDays: parseInt(leadTimeDays, 10) || 0,
          fulfillmentMode,
          pricingTiers,
          status,
          dielineId: dielineId.trim() || null,
        })
        if (!result.ok) return setError(result.error)
        toast.success('Saved')
        router.refresh()
      }
    })
  }

  if (services.length === 0) {
    return (
      <div className="rounded-lg border border-warning-200 bg-warning-50 p-6 text-sm text-warning-800">
        Add a service first — packaging offerings attach to one of your services.
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-ink-200 bg-white p-6"
    >
      {/* Service */}
      <div className="space-y-1.5">
        <Label htmlFor="service" className="text-sm font-medium text-ink-900">
          Service
        </Label>
        <select
          id="service"
          value={partnerServiceId}
          onChange={(e) => setPartnerServiceId(e.target.value)}
          disabled={isPending || mode === 'edit'}
          className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm disabled:bg-ink-50 disabled:text-ink-500"
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Container type + decoration */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type" className="text-sm font-medium text-ink-900">
            Container type
          </Label>
          {mode === 'edit' ? (
            <Input
              value={selectedType?.displayName ?? '—'}
              disabled
              className="bg-ink-50 text-ink-500"
            />
          ) : (
            <select
              id="type"
              value={packagingTypeId}
              onChange={(e) => onTypeChange(e.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a container…</option>
              {packagingTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                  {t.containerCategoryLabel ? ` · ${t.containerCategoryLabel}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="decoration" className="text-sm font-medium text-ink-900">
            Decoration method
          </Label>
          {mode === 'edit' ? (
            <Input
              value={initial ? DECORATION_LABELS[initial.decorationMethod] : '—'}
              disabled
              className="bg-ink-50 text-ink-500"
            />
          ) : (
            <select
              id="decoration"
              value={decorationMethod}
              onChange={(e) => onDecorationChange(e.target.value as DecorationMethod)}
              disabled={isPending || !packagingTypeId}
              className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm disabled:bg-ink-50"
            >
              <option value="">
                {packagingTypeId ? 'Select a method…' : 'Pick a container first'}
              </option>
              {decorationOptions.map((m) => (
                <option key={m} value={m}>
                  {DECORATION_LABELS[m]}
                </option>
              ))}
            </select>
          )}
          {mode === 'create' && packagingTypeId && decorationOptions.length === 0 && (
            <p className="text-ui-caption text-warning-700">
              No decoration methods are configured for this container yet.
            </p>
          )}
        </div>
      </div>

      {/* MOQ + lead time */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="moq" className="text-sm font-medium text-ink-900">
            MOQ (units)
          </Label>
          <Input
            id="moq"
            type="number"
            min={1}
            value={moq}
            onChange={(e) => setMoq(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead" className="text-sm font-medium text-ink-900">
            Lead time (days)
          </Label>
          <Input
            id="lead"
            type="number"
            min={0}
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      {/* Fulfillment mode */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-ink-900">Fulfillment mode</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {FULFILLMENT_OPTIONS.map((opt) => {
            const selected = fulfillmentMode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFulfillmentMode(opt.value)}
                disabled={isPending}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  selected
                    ? 'border-ink-900 bg-ink-900/[0.04] ring-1 ring-ink-900'
                    : 'border-ink-200 bg-white hover:border-ink-400'
                }`}
              >
                <div className="font-medium text-ink-900">{opt.label}</div>
                <div className="mt-0.5 text-ui-caption text-ink-500">{opt.hint}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Pricing tiers */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-ink-900">Pricing tiers</Label>
        <p className="text-ui-caption text-ink-500">
          At least one tier. Each is a quantity breakpoint and the per-unit price at that volume.
        </p>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <span className="text-ui-caption text-ink-500">Min qty</span>
                <Input
                  type="number"
                  min={1}
                  value={t.minQty}
                  onChange={(e) => updateTier(i, 'minQty', e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="flex-1 space-y-1">
                <span className="text-ui-caption text-ink-500">Price / unit ($)</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="1.20"
                  value={t.pricePerUnit}
                  onChange={(e) => updateTier(i, 'pricePerUnit', e.target.value)}
                  disabled={isPending}
                />
              </div>
              <button
                type="button"
                onClick={() => removeTier(i)}
                disabled={isPending || tiers.length <= 1}
                title={tiers.length <= 1 ? 'At least one tier is required' : 'Remove tier'}
                className="flex h-11 w-11 items-center justify-center rounded-md border border-ink-300 text-ink-500 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTier}
          disabled={isPending}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add tier
        </Button>
      </div>

      {/* Dieline binding (optional) — only the partner's own dielines that match
          this exact (container type, decoration method) and are live/confirmed. */}
      <div className="space-y-1.5">
        <Label htmlFor="dieline" className="text-sm font-medium text-ink-900">
          Dieline (optional)
        </Label>
        <select
          id="dieline"
          value={dielineId}
          onChange={(e) => setDielineId(e.target.value)}
          disabled={isPending || !packagingTypeId || !decorationMethod}
          className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm disabled:bg-ink-50"
        >
          <option value="">— none —</option>
          {eligibleDielines.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {d.status === 'PARTNER_CONFIRMED' ? ' (confirmed)' : ''}
            </option>
          ))}
        </select>
        {packagingTypeId && decorationMethod && eligibleDielines.length === 0 ? (
          <p className="text-ui-caption text-ink-500">
            No confirmed or active dielines match this container and decoration yet.{' '}
            <a href="/packaging/dielines/new" className="underline hover:text-ink-700">
              Add one
            </a>
            .
          </p>
        ) : (
          <p className="text-ui-caption text-ink-500">
            Link a prepress dieline so creators print to the right cut. Confirm or activate a
            dieline first to make it selectable.
          </p>
        )}
      </div>

      {/* Status */}
      <div className="space-y-1.5">
        <Label htmlFor="status" className="text-sm font-medium text-ink-900">
          Status
        </Label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as OfferingStatus)}
          disabled={isPending}
          className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-ui-caption text-ink-500">
          {STATUS_OPTIONS.find((o) => o.value === status)?.hint}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending} className="bg-ink-900 hover:bg-ink-700">
          {isPending ? 'Saving…' : mode === 'create' ? 'Create offering' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
