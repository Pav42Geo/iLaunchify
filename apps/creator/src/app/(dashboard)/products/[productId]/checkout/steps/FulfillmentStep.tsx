'use client'

// Step 4 — Fulfillment (G4).
//
// Four ship-to modes:
//   1. CLOSEST_WAREHOUSE — auto-pick the nearest WAREHOUSE PartnerService
//      based on creator region (V1.5 — V1 just picks the first ACTIVE)
//   2. SPECIFIC_WAREHOUSE — searchable list of eligible warehouses
//   3. SAVED_ADDRESS — pick from CreatorSavedAddress[]
//   4. NEW_ADDRESS — inline form with save-for-later checkbox
//
// Each pick emits a re-estimate so the right-rail Shipping line stays
// in sync.

import { useEffect, useState, useTransition } from 'react'
import { Loader2, Plus, Star, Warehouse, Home } from 'lucide-react'
import { toast } from 'sonner'
import { StepShell } from './_StepShell'
import type { FulfillmentState } from '../types'
import {
  estimateShipping,
  listFulfillmentOptions,
  saveCreatorAddress,
  type FulfillmentOptions,
  type SavedAddressOption,
  type WarehouseOption,
} from '../fulfillment-actions'

interface Props {
  productId: string
  state: FulfillmentState
  onChange: (patch: Partial<FulfillmentState>) => void
  // G4d — the wizard lifts the shipping estimate up so the right-rail
  // OrderSummary can render real cents in the Shipping row.
  quantity: number
  onShippingEstimate?: (
    estimate: { shippingCents: number; leadTimeBusinessDays: number } | null,
  ) => void
}

export function FulfillmentStep({
  productId,
  state,
  onChange,
  quantity,
  onShippingEstimate,
}: Props) {
  const [options, setOptions] = useState<FulfillmentOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listFulfillmentOptions(productId).then((result) => {
      if (cancelled) return
      if (result.ok) setOptions(result.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [productId, reloadKey])

  // Debounced shipping estimate that fires whenever ship-to selection or
  // quantity changes. Cleared (null) when the user hasn't picked a mode
  // yet so OrderSummary can fall back to its placeholder.
  useEffect(() => {
    if (!state.shipToType || !onShippingEstimate) return
    const id = setTimeout(async () => {
      const result = await estimateShipping({
        productId,
        shipToType: state.shipToType!,
        warehousePartnerServiceId: state.warehousePartnerServiceId,
        savedAddressId: state.savedAddressId,
        newAddressCountry: state.newAddress?.country ?? null,
        quantity,
      })
      if (result.ok) onShippingEstimate(result.data)
    }, 220)
    return () => clearTimeout(id)
  }, [
    productId,
    quantity,
    state.shipToType,
    state.warehousePartnerServiceId,
    state.savedAddressId,
    state.newAddress?.country,
    onShippingEstimate,
  ])

  const modes: Array<{
    key: NonNullable<FulfillmentState['shipToType']>
    label: string
    hint: string
    icon: React.ComponentType<{ className?: string }>
  }> = [
    {
      key: 'CLOSEST_WAREHOUSE',
      label: 'Closest WAREHOUSE partner',
      hint: 'Auto-pick the nearest 3PL — cheapest shipping, fastest to ready.',
      icon: Warehouse,
    },
    {
      key: 'SPECIFIC_WAREHOUSE',
      label: 'Specific WAREHOUSE partner',
      hint: 'Choose from the list of active warehouses.',
      icon: Warehouse,
    },
    {
      key: 'SAVED_ADDRESS',
      label: 'Saved address',
      hint: 'Use a destination you keep on file.',
      icon: Star,
    },
    {
      key: 'NEW_ADDRESS',
      label: 'New address',
      hint: 'One-off destination — optionally save for next time.',
      icon: Home,
    },
  ]

  return (
    <StepShell
      index={4}
      title="Where should we ship?"
      subtitle="Goods land at your destination after production wraps."
    >
      <div className="space-y-3">
        {modes.map((m) => {
          const selected = state.shipToType === m.key
          const Icon = m.icon
          return (
            <div
              key={m.key}
              className={
                'overflow-hidden rounded-lg border transition-colors ' +
                (selected ? 'border-pink-300' : 'border-ink-200')
              }
            >
              <label
                className={
                  'flex cursor-pointer items-start gap-3 p-4 ' +
                  (selected ? 'bg-pink-50/40' : 'bg-white hover:bg-ink-50/50')
                }
              >
                <input
                  type="radio"
                  name="shipToType"
                  value={m.key}
                  checked={selected}
                  onChange={() =>
                    onChange({
                      shipToType: m.key,
                      // Clear sibling selections when switching mode so
                      // estimateShipping reads consistent state.
                      warehousePartnerServiceId:
                        m.key === 'SPECIFIC_WAREHOUSE'
                          ? state.warehousePartnerServiceId
                          : null,
                      savedAddressId:
                        m.key === 'SAVED_ADDRESS' ? state.savedAddressId : null,
                      newAddress: m.key === 'NEW_ADDRESS' ? state.newAddress : null,
                    })
                  }
                  className="mt-0.5 accent-pink-500"
                />
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-ink-500" />
                  <span>
                    <span className="block text-sm font-medium text-ink-900">
                      {m.label}
                    </span>
                    <span className="block text-xs text-ink-500">{m.hint}</span>
                  </span>
                </span>
              </label>

              {selected && (
                <div className="border-t border-pink-200 bg-white p-4">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
                  ) : m.key === 'CLOSEST_WAREHOUSE' ? (
                    <ClosestWarehouseBlock options={options} />
                  ) : m.key === 'SPECIFIC_WAREHOUSE' ? (
                    <SpecificWarehouseBlock
                      options={options}
                      pickedId={state.warehousePartnerServiceId}
                      onPick={(id) => onChange({ warehousePartnerServiceId: id })}
                    />
                  ) : m.key === 'SAVED_ADDRESS' ? (
                    <SavedAddressBlock
                      options={options}
                      pickedId={state.savedAddressId}
                      onPick={(id) => onChange({ savedAddressId: id })}
                    />
                  ) : (
                    <NewAddressBlock
                      productId={productId}
                      state={state}
                      onChange={onChange}
                      onSaved={() => setReloadKey((k) => k + 1)}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </StepShell>
  )
}

// -----------------------------------------------------------------------------
// CLOSEST_WAREHOUSE block — V1 just picks the first ACTIVE warehouse with
// a polite explainer until real proximity scoring lands (#153).
// -----------------------------------------------------------------------------

function ClosestWarehouseBlock({ options }: { options: FulfillmentOptions | null }) {
  const first = options?.warehouses[0]
  if (!first) {
    return (
      <p className="text-sm text-ink-500">
        No active WAREHOUSE partners yet. Pick a saved or new address while we
        onboard fulfillment partners in your region.
      </p>
    )
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-ink-700">
        We&apos;ll route to <strong>{first.partnerName}</strong>
        {first.city && ` in ${first.city}${first.state ? `, ${first.state}` : ''}`}.
      </p>
      <p className="text-[11.5px] text-ink-500">
        Real proximity scoring lands when marketplace partner matching (#153)
        ships. V1 picks the first active warehouse to keep your flow moving.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// SPECIFIC_WAREHOUSE block — full list with picker
// -----------------------------------------------------------------------------

function SpecificWarehouseBlock({
  options,
  pickedId,
  onPick,
}: {
  options: FulfillmentOptions | null
  pickedId: string | null
  onPick: (id: string) => void
}) {
  const list = options?.warehouses ?? []
  if (list.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No active WAREHOUSE partners yet.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {list.map((w) => (
        <WarehouseCard
          key={w.id}
          warehouse={w}
          selected={pickedId === w.id}
          onClick={() => onPick(w.id)}
        />
      ))}
    </div>
  )
}

function WarehouseCard({
  warehouse,
  selected,
  onClick,
}: {
  warehouse: WarehouseOption
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors ' +
        (selected
          ? 'border-pink-400 bg-pink-50/40 ring-2 ring-pink-200'
          : 'border-ink-200 bg-white hover:bg-ink-50/40')
      }
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink-900">
          {warehouse.partnerName}
        </div>
        <div className="text-xs text-ink-500">
          {warehouse.city && `${warehouse.city}, `}
          {warehouse.state ?? warehouse.country}
        </div>
        {warehouse.capabilityHints.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {warehouse.capabilityHints.map((h) => (
              <span
                key={h}
                className="inline-flex rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-700"
              >
                {h}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

// -----------------------------------------------------------------------------
// SAVED_ADDRESS block — list of CreatorSavedAddress with default star
// -----------------------------------------------------------------------------

function SavedAddressBlock({
  options,
  pickedId,
  onPick,
}: {
  options: FulfillmentOptions | null
  pickedId: string | null
  onPick: (id: string) => void
}) {
  const list = options?.savedAddresses ?? []
  if (list.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No saved addresses yet. Pick &ldquo;New address&rdquo; and tick
        &ldquo;Save for next time&rdquo; to start your list.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {list.map((a) => (
        <SavedAddressCard
          key={a.id}
          address={a}
          selected={pickedId === a.id}
          onClick={() => onPick(a.id)}
        />
      ))}
    </div>
  )
}

function SavedAddressCard({
  address,
  selected,
  onClick,
}: {
  address: SavedAddressOption
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors ' +
        (selected
          ? 'border-pink-400 bg-pink-50/40 ring-2 ring-pink-200'
          : 'border-ink-200 bg-white hover:bg-ink-50/40')
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-900">{address.label}</span>
          {address.isDefault && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-amber-800">
              <Star className="h-2.5 w-2.5" /> Default
            </span>
          )}
        </div>
        <div className="text-xs text-ink-600">
          {address.contactName} · {address.addressLine1}
          {address.addressLine2 && `, ${address.addressLine2}`}
        </div>
        <div className="text-xs text-ink-500">
          {address.city}, {address.state ?? ''} {address.postalCode}
        </div>
      </div>
    </button>
  )
}

// -----------------------------------------------------------------------------
// NEW_ADDRESS block — inline form + save-for-later checkbox
// -----------------------------------------------------------------------------

function NewAddressBlock({
  productId,
  state,
  onChange,
  onSaved,
}: {
  productId: string
  state: FulfillmentState
  onChange: (patch: Partial<FulfillmentState>) => void
  onSaved: () => void
}) {
  const addr = state.newAddress ?? {
    label: '',
    contactName: '',
    contactPhone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  }
  const [isSaving, startSaving] = useTransition()

  function setField<K extends keyof typeof addr>(field: K, value: (typeof addr)[K]) {
    onChange({
      newAddress: { ...addr, [field]: value },
    })
  }

  function persist() {
    if (!addr.contactName || !addr.addressLine1 || !addr.city || !addr.postalCode) {
      toast.error('Fill in recipient, street, city, and postal code first.')
      return
    }
    startSaving(async () => {
      const result = await saveCreatorAddress({
        productId,
        address: addr,
        makeDefault: false,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Saved to your address book.')
      // Move the wizard's selection to the new SavedAddress mode.
      onChange({
        shipToType: 'SAVED_ADDRESS',
        savedAddressId: result.data.savedAddressId,
        newAddress: null,
        saveNewAddress: false,
      })
      onSaved()
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label (optional)">
          <input
            type="text"
            value={addr.label ?? ''}
            onChange={(e) => setField('label', e.target.value)}
            placeholder="Home / Studio / 3PL"
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Recipient name *">
          <input
            type="text"
            value={addr.contactName}
            onChange={(e) => setField('contactName', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Phone (optional)">
          <input
            type="tel"
            value={addr.contactPhone ?? ''}
            onChange={(e) => setField('contactPhone', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Country">
          <input
            type="text"
            value={addr.country}
            onChange={(e) => setField('country', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
      </div>

      <Field label="Street address *">
        <input
          type="text"
          value={addr.addressLine1}
          onChange={(e) => setField('addressLine1', e.target.value)}
          placeholder="123 Launch Lane"
          className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
        />
      </Field>

      <Field label="Apartment / suite (optional)">
        <input
          type="text"
          value={addr.addressLine2 ?? ''}
          onChange={(e) => setField('addressLine2', e.target.value)}
          className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-[1fr,140px,140px]">
        <Field label="City *">
          <input
            type="text"
            value={addr.city}
            onChange={(e) => setField('city', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="State / region">
          <input
            type="text"
            value={addr.state ?? ''}
            onChange={(e) => setField('state', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Postal code *">
          <input
            type="text"
            value={addr.postalCode}
            onChange={(e) => setField('postalCode', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <label className="flex items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={state.saveNewAddress}
            onChange={(e) => onChange({ saveNewAddress: e.target.checked })}
            className="accent-pink-500"
          />
          Save to my address book for next time
        </label>
        {state.saveNewAddress && (
          <button
            type="button"
            onClick={persist}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-black disabled:opacity-60"
          >
            <Plus className="h-3 w-3" /> Save address
          </button>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
        {label}
      </label>
      {children}
    </div>
  )
}
