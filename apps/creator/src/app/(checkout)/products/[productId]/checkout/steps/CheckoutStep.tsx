'use client'

// REBUILD R8.d — Step 3 · Checkout (merged Fulfillment + Cart).
//
// Pre-R8 this lived as two separate steps: a Fulfillment picker (G4) and
// a My Cart payment screen (G5). R8 collapses them into a single
// Amazon-style page: delivery address → shipping method → payment method
// → review + place order.
//
// V1 keeps "Standard ground" as the only shipping method (real carrier
// selection lands in V1.5 when partner-side shipping options ship). The
// payment block is a Stripe handoff explainer; actual card entry happens
// in Stripe Checkout after the creator clicks Place order.

import { useEffect, useId, useState, useTransition } from 'react'
// useTransition kept for the NewAddressBlock "Save address" sub-flow.
import {
  AlertOctagon,
  CheckCircle2,
  CreditCard,
  Home,
  Loader2,
  Lock,
  Plus,
  Star,
  Truck,
  Warehouse,
} from 'lucide-react'
import { toast } from 'sonner'
import { StepShell } from './_StepShell'
import type {
  CartState,
  CheckoutDraftState,
  FulfillmentState,
  NewAddressInput,
} from '../types'
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
  state: CartState
  draft: CheckoutDraftState
  onChange: (patch: Partial<CartState>) => void
  onFulfillmentChange: (patch: Partial<FulfillmentState>) => void
  onShippingEstimate?: (
    estimate: { shippingCents: number; leadTimeBusinessDays: number } | null,
  ) => void
}

export function CheckoutStep({
  productId,
  state,
  draft,
  onChange,
  onFulfillmentChange,
  onShippingEstimate,
}: Props) {
  const [options, setOptions] = useState<FulfillmentOptions | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    listFulfillmentOptions(productId).then((result) => {
      if (cancelled) return
      if (result.ok) setOptions(result.data)
      setLoadingOptions(false)
    })
    return () => {
      cancelled = true
    }
  }, [productId, reloadKey])

  // Re-estimate shipping when ship-to or quantity changes. Same wiring
  // the standalone FulfillmentStep used pre-R8 — the lift target is the
  // wizard's `setShipping` for the right-rail OrderSummary.
  useEffect(() => {
    if (!draft.fulfillment.shipToType || !onShippingEstimate) return
    const id = setTimeout(async () => {
      const result = await estimateShipping({
        productId,
        shipToType: draft.fulfillment.shipToType!,
        warehousePartnerServiceId: draft.fulfillment.warehousePartnerServiceId,
        savedAddressId: draft.fulfillment.savedAddressId,
        newAddressCountry: draft.fulfillment.newAddress?.country ?? null,
        quantity: draft.production.quantity ?? 0,
      })
      if (result.ok) onShippingEstimate(result.data)
    }, 220)
    return () => clearTimeout(id)
  }, [
    productId,
    draft.production.quantity,
    draft.fulfillment.shipToType,
    draft.fulfillment.warehousePartnerServiceId,
    draft.fulfillment.savedAddressId,
    draft.fulfillment.newAddress?.country,
    onShippingEstimate,
  ])

  const blockingCount = state.complianceAck?.blockingFindingIds.length ?? 0
  const hasBlockings = blockingCount > 0
  const acknowledged = !!state.complianceAck?.acknowledged

  function toggleAck() {
    if (acknowledged) {
      onChange({ complianceAck: null })
      return
    }
    onChange({
      complianceAck: {
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        blockingFindingIds: state.complianceAck?.blockingFindingIds ?? [],
      },
    })
  }

  // Place-order action moved to CheckoutWizard's PlaceOrderCard on
  // 2026-06-01 (Pavel: pink button + Terms line in the right rail,
  // top of the column, Amazon style).

  return (
    <StepShell
      index={3}
      title="Checkout"
      subtitle="Confirm shipping and payment, then place your order."
    >
      <div className="space-y-5">
        {/* 1 · Delivery address */}
        <Section title="Delivery address" stepNumber={1}>
          <ShipToPicker
            state={draft.fulfillment}
            onChange={onFulfillmentChange}
            options={options}
            loading={loadingOptions}
            productId={productId}
            onSavedNewAddress={() => setReloadKey((k) => k + 1)}
          />
        </Section>

        {/* 2 · Shipping method (V1 = standard) */}
        <Section title="Shipping method" stepNumber={2}>
          <ShippingMethodCard />
        </Section>

        {/* 3 · Payment method */}
        <Section title="Payment method" stepNumber={3}>
          <PaymentSummary />
        </Section>

        {/* 4 · Promo + compliance ack + Place order */}
        <Section title="Review & place order" stepNumber={4}>
          {/* Promo code */}
          <div className="rounded-lg border border-ink-200 bg-white p-4">
            <label className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
              Promo code (optional)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={state.promoCode ?? ''}
                onChange={(e) =>
                  onChange({
                    promoCode: e.target.value.trim().toUpperCase() || null,
                  })
                }
                placeholder="LAUNCH50"
                className="block w-48 rounded-md border border-ink-200 px-3 py-1.5 text-sm uppercase tracking-wider focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
              />
              {state.promoCode && (
                <span className="text-[11px] text-ink-500">
                  Validated at payment — invalid codes won&apos;t block payment.
                </span>
              )}
            </div>
          </div>

          {hasBlockings && (
            <BlockingAckPanel
              count={blockingCount}
              acknowledged={acknowledged}
              onToggle={toggleAck}
            />
          )}
        </Section>
      </div>
    </StepShell>
  )
}

// =============================================================================
// Section — Amazon-style numbered band
// =============================================================================

function Section({
  title,
  stepNumber,
  children,
}: {
  title: string
  stepNumber: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white">
      <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-3">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-[11px] font-bold text-white">
          {stepNumber}
        </span>
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      </header>
      <div className="space-y-3 p-5">{children}</div>
    </section>
  )
}

// =============================================================================
// ShipToPicker — compact Amazon-style 4-mode picker
// =============================================================================

function ShipToPicker({
  state,
  onChange,
  options,
  loading,
  productId,
  onSavedNewAddress,
}: {
  state: FulfillmentState
  onChange: (patch: Partial<FulfillmentState>) => void
  options: FulfillmentOptions | null
  loading: boolean
  productId: string
  onSavedNewAddress: () => void
}) {
  const modes: Array<{
    key: NonNullable<FulfillmentState['shipToType']>
    label: string
    hint: string
    icon: React.ComponentType<{ className?: string }>
  }> = [
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
    {
      key: 'CLOSEST_WAREHOUSE',
      label: 'Closest warehouse partner',
      hint: 'Auto-pick the nearest 3PL — cheapest shipping.',
      icon: Warehouse,
    },
    {
      key: 'SPECIFIC_WAREHOUSE',
      label: 'Specific warehouse partner',
      hint: 'Choose from the list of active warehouses.',
      icon: Warehouse,
    },
  ]

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {modes.map((m) => {
          const selected = state.shipToType === m.key
          const Icon = m.icon
          return (
            <button
              key={m.key}
              type="button"
              onClick={() =>
                onChange({
                  shipToType: m.key,
                  warehousePartnerServiceId:
                    m.key === 'SPECIFIC_WAREHOUSE'
                      ? state.warehousePartnerServiceId
                      : null,
                  savedAddressId:
                    m.key === 'SAVED_ADDRESS' ? state.savedAddressId : null,
                  newAddress: m.key === 'NEW_ADDRESS' ? state.newAddress : null,
                })
              }
              className={
                'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ' +
                (selected
                  ? 'border-pink-400 bg-pink-50/40 ring-2 ring-pink-200'
                  : 'border-ink-200 bg-white hover:bg-ink-50/40')
              }
            >
              <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink-900">
                  {m.label}
                </div>
                <div className="text-[11.5px] leading-snug text-ink-500">
                  {m.hint}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Expanded block for the selected mode */}
      {state.shipToType && (
        <div className="rounded-lg border border-ink-100 bg-ink-50/40 p-4">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
          ) : state.shipToType === 'CLOSEST_WAREHOUSE' ? (
            <ClosestWarehouseBlock options={options} />
          ) : state.shipToType === 'SPECIFIC_WAREHOUSE' ? (
            <SpecificWarehouseBlock
              options={options}
              pickedId={state.warehousePartnerServiceId}
              onPick={(id) => onChange({ warehousePartnerServiceId: id })}
            />
          ) : state.shipToType === 'SAVED_ADDRESS' ? (
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
              onSaved={onSavedNewAddress}
            />
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// ShippingMethodCard — V1 = standard ground only
// =============================================================================

function ShippingMethodCard() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-ink-200 bg-white p-4">
      <Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-900">
            Standard production
          </span>
          <span className="rounded-full bg-emerald-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700">
            Included
          </span>
        </div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">
          Lead time + rate are calculated once your destination is locked.
          Expedited tiers ship in V1.5.
        </p>
      </div>
    </div>
  )
}

// =============================================================================
// PaymentSummary — Stripe handoff explainer (real cards entered post-click)
// =============================================================================

function PaymentSummary() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-ink-200 bg-white p-4">
      <CreditCard className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-900">
            Credit or debit card
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-ink-600">
            <Lock className="h-2.5 w-2.5" /> Stripe
          </span>
        </div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">
          Card details are entered on Stripe&apos;s secure page after you
          place the order. We never see or store the card.
        </p>
      </div>
    </div>
  )
}

// =============================================================================
// Sub-blocks reused from the old FulfillmentStep
// =============================================================================

function ClosestWarehouseBlock({ options }: { options: FulfillmentOptions | null }) {
  const first = options?.warehouses[0]
  if (!first) {
    return (
      <p className="text-sm text-ink-500">
        No active warehouse partners yet. Pick &ldquo;Saved address&rdquo; or
        &ldquo;New address&rdquo; while we onboard 3PLs in your region.
      </p>
    )
  }
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
        <span className="text-ink-800">
          Routing to <strong>{first.partnerName}</strong>
          {first.city && ` in ${first.city}${first.state ? `, ${first.state}` : ''}`}
        </span>
      </div>
      <p className="text-[11.5px] text-ink-500">
        Real proximity scoring ships in V1.5; for now we pick the first active
        warehouse to keep you moving.
      </p>
    </div>
  )
}

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
    return <p className="text-sm text-ink-500">No active warehouse partners yet.</p>
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
        No saved addresses yet. Switch to &ldquo;New address&rdquo; and tick
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
  // R9.b — stable input ids let Field wire htmlFor → input.id for proper
  // screen-reader label association. Generated once per mount via useId
  // so each form has a unique prefix even if two NewAddressBlock instances
  // ever mount on the same page.
  const fieldId = useId()
  const addr: NewAddressInput = state.newAddress ?? {
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

  function setField<K extends keyof NewAddressInput>(
    field: K,
    value: NewAddressInput[K],
  ) {
    onChange({ newAddress: { ...addr, [field]: value } })
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
        <Field label="Label (optional)" htmlFor={`${fieldId}-label`}>
          <input
            id={`${fieldId}-label`}
            type="text"
            value={addr.label ?? ''}
            onChange={(e) => setField('label', e.target.value)}
            placeholder="Home / Studio / 3PL"
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Recipient name *" htmlFor={`${fieldId}-name`}>
          <input
            id={`${fieldId}-name`}
            type="text"
            required
            value={addr.contactName}
            onChange={(e) => setField('contactName', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Phone (optional)" htmlFor={`${fieldId}-phone`}>
          <input
            id={`${fieldId}-phone`}
            type="tel"
            autoComplete="tel"
            value={addr.contactPhone ?? ''}
            onChange={(e) => setField('contactPhone', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Country" htmlFor={`${fieldId}-country`}>
          <input
            id={`${fieldId}-country`}
            type="text"
            autoComplete="country"
            value={addr.country}
            onChange={(e) => setField('country', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
      </div>

      <Field label="Street address *" htmlFor={`${fieldId}-street1`}>
        <input
          id={`${fieldId}-street1`}
          type="text"
          required
          autoComplete="address-line1"
          value={addr.addressLine1}
          onChange={(e) => setField('addressLine1', e.target.value)}
          placeholder="123 Launch Lane"
          className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
        />
      </Field>

      <Field label="Apartment / suite (optional)" htmlFor={`${fieldId}-street2`}>
        <input
          id={`${fieldId}-street2`}
          type="text"
          autoComplete="address-line2"
          value={addr.addressLine2 ?? ''}
          onChange={(e) => setField('addressLine2', e.target.value)}
          className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-[1fr,140px,140px]">
        <Field label="City *" htmlFor={`${fieldId}-city`}>
          <input
            id={`${fieldId}-city`}
            type="text"
            required
            autoComplete="address-level2"
            value={addr.city}
            onChange={(e) => setField('city', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="State / region" htmlFor={`${fieldId}-state`}>
          <input
            id={`${fieldId}-state`}
            type="text"
            autoComplete="address-level1"
            value={addr.state ?? ''}
            onChange={(e) => setField('state', e.target.value)}
            className="block w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>
        <Field label="Postal code *" htmlFor={`${fieldId}-postal`}>
          <input
            id={`${fieldId}-postal`}
            type="text"
            required
            autoComplete="postal-code"
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
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="block text-[10.5px] font-semibold uppercase tracking-widest text-ink-500"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

// =============================================================================
// Blocking ack panel (DS-69 pattern, verb switched to Proceed)
// =============================================================================

function BlockingAckPanel({
  count,
  acknowledged,
  onToggle,
}: {
  count: number
  acknowledged: boolean
  onToggle: () => void
}) {
  const labelId = 'compliance-ack-label'
  return (
    <section
      role="alert"
      aria-labelledby="compliance-ack-heading"
      className={
        'rounded-md border p-4 ' +
        (acknowledged
          ? 'border-amber-300 bg-amber-50/60'
          : 'border-pink-500 bg-pink-50')
      }
    >
      <div className="flex items-start gap-2.5">
        <AlertOctagon
          aria-hidden="true"
          className={
            'mt-0.5 h-4 w-4 flex-shrink-0 ' +
            (acknowledged ? 'text-amber-700' : 'text-pink-700')
          }
        />
        <div className="flex-1">
          <h3 id="compliance-ack-heading" className="text-[12.5px] font-bold text-ink-900">
            {count} unresolved compliance {count === 1 ? 'issue' : 'issues'}
          </h3>
          <p className="mt-1 text-[11.5px] leading-snug text-ink-700">
            Required FDA-label elements are missing or malformed. If a
            professional designer prepared this artwork and you&apos;ve
            reviewed it offline, you can proceed at your own risk — otherwise
            return to the canvas and re-run the compliance scan.
          </p>
          <div
            role="checkbox"
            aria-checked={acknowledged}
            aria-labelledby={labelId}
            tabIndex={0}
            onClick={onToggle}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                onToggle()
              }
            }}
            className="mt-3 flex cursor-pointer items-start gap-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
          >
            <span
              aria-hidden="true"
              className={
                'relative mt-0.5 h-4 w-4 flex-shrink-0 rounded border-[1.5px] transition-colors ' +
                (acknowledged
                  ? 'border-amber-500 bg-amber-500'
                  : 'border-pink-500 bg-white')
              }
            >
              {acknowledged && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                  ✓
                </span>
              )}
            </span>
            <span id={labelId} className="text-[11.5px] leading-snug text-ink-900">
              <span className="font-semibold">
                I&apos;ve reviewed the issues and accept responsibility for
                label compliance.
              </span>{' '}
              I understand that iLaunchify will not block production based on
              the compliance scanner&apos;s findings.
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
