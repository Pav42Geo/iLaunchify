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
  ChevronDown,
  CreditCard,
  Factory,
  Home,
  Loader2,
  Lock,
  Plus,
  Star,
  Store,
  Truck,
  Warehouse,
} from 'lucide-react'
import { Checkbox, formatCents } from '@ilaunchify/ui'
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
  listDestinationOptions,
  listFulfillmentOptions,
  saveCreatorAddress,
  type ChannelInboundOption,
  type DestinationOptionsPayload,
  type FulfillmentOptions,
  type HoldStorageOffer,
  type SavedAddressOption,
  type SuggestedFcOption,
  type WarehouseOption,
} from '../fulfillment-actions'
import {
  loadFcLabelingOffers,
  type FcLabelingContext,
  type FcLabelingOffer,
} from '../labeling-actions'
import type { ShippingHop } from '../shipping-hops'

interface Props {
  productId: string
  state: CartState
  draft: CheckoutDraftState
  onChange: (patch: Partial<CartState>) => void
  onFulfillmentChange: (patch: Partial<FulfillmentState>) => void
  onShippingEstimate?: (
    estimate: {
      shippingCents: number
      leadTimeBusinessDays: number
      hops?: ShippingHop[]
    } | null,
  ) => void
  // PS-3c — lifts the ACTIVE FC-labeling fee (creator ticked the box on a
  // qualifying FC) to the wizard so the OrderSummary can show the line.
  // Null = no fee in play.
  onFcLabelingFee?: (feeCentsPerUnit: number | null) => void
}

export function CheckoutStep({
  productId,
  state,
  draft,
  onChange,
  onFulfillmentChange,
  onShippingEstimate,
  onFcLabelingFee,
}: Props) {
  const [options, setOptions] = useState<FulfillmentOptions | null>(null)
  // L1b — the four-destination-card payload (eligibility + disabled copy +
  // suggested FC + hold-at-manufacturer fee card). Display data only; the
  // Pay action re-runs the same eligibility server-side.
  const [destinations, setDestinations] = useState<DestinationOptionsPayload | null>(null)
  // PS-3c (§8.1a) — FC "Can finalize labeling here" offers. Empty unless this
  // order needs application downstream of the manufacturer. Display data only;
  // the Pay action re-derives eligibility + fee server-side.
  const [labeling, setLabeling] = useState<FcLabelingContext | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    Promise.all([
      listFulfillmentOptions(productId),
      listDestinationOptions(productId),
      loadFcLabelingOffers(productId),
    ]).then(([fulfillment, destination, labelingRes]) => {
      if (cancelled) return
      if (fulfillment.ok) setOptions(fulfillment.data)
      if (destination.ok) setDestinations(destination.data)
      if (labelingRes.ok) setLabeling(labelingRes.data)
      setLoadingOptions(false)
    })
    return () => {
      cancelled = true
    }
  }, [productId, reloadKey])

  // PS-3c — the FC the order would actually land at (explicit pick, or the
  // suggested node for CLOSEST_WAREHOUSE), and its verified RELABEL offer.
  const effectiveFcId =
    draft.fulfillment.shipToType === 'SPECIFIC_WAREHOUSE'
      ? draft.fulfillment.warehousePartnerServiceId
      : draft.fulfillment.shipToType === 'CLOSEST_WAREHOUSE'
        ? (destinations?.suggestedFc?.partnerServiceId ?? null)
        : null
  const effectiveFcOffer: FcLabelingOffer | null =
    (effectiveFcId &&
      labeling?.needsExternalApplication &&
      labeling.offers.find((o) => o.partnerServiceId === effectiveFcId)) ||
    null

  // Lift the applied fee for the right-rail summary (null when the box is off,
  // the FC doesn't qualify, or ship-to isn't an FC at all).
  useEffect(() => {
    if (!onFcLabelingFee) return
    onFcLabelingFee(
      effectiveFcOffer && draft.fulfillment.labelingAtFc
        ? effectiveFcOffer.feeCentsPerUnit
        : null,
    )
  }, [onFcLabelingFee, effectiveFcOffer, draft.fulfillment.labelingAtFc])

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
        // PS-3d — label hop rates on physical units; FC copy when opted in.
        physicalUnits:
          (draft.production.quantity ?? 0) *
          (draft.production.pack?.unitsPerPack ?? 1),
        labelingAtFc: draft.fulfillment.labelingAtFc === true,
      })
      if (result.ok) onShippingEstimate(result.data)
    }, 220)
    return () => clearTimeout(id)
  }, [
    productId,
    draft.production.quantity,
    draft.production.pack?.unitsPerPack,
    draft.fulfillment.shipToType,
    draft.fulfillment.warehousePartnerServiceId,
    draft.fulfillment.savedAddressId,
    draft.fulfillment.newAddress?.country,
    draft.fulfillment.labelingAtFc,
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
            destinations={destinations}
            labeling={labeling}
            effectiveFcOffer={effectiveFcOffer}
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
          <div className="rounded-xl border border-ink-200 bg-white p-4">
            <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
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
                className="block w-48 rounded-xl border border-ink-200 px-3 py-2 text-[13px] uppercase tracking-wider focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
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
    <section className="rounded-2xl border border-ink-200 bg-white">
      <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-3">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-[11px] font-bold text-white">
          {stepNumber}
        </span>
        <h2 className="text-ui-value text-ink-900">{title}</h2>
      </header>
      <div className="space-y-3 p-5">{children}</div>
    </section>
  )
}

// =============================================================================
// ShipToPicker — L1b four-destination cards (LOGISTICS_AND_FULFILLMENT §2/§9):
// Creator address · Fulfillment center · Keep at manufacturer · Sales channel.
// Disabled cards show the server-provided reason and are non-clickable; the
// Pay action re-checks eligibility server-side either way.
// =============================================================================

type DestinationCardType =
  | 'CREATOR_ADDRESS'
  | 'WAREHOUSE_PARTNER'
  | 'HOLD_AT_MANUFACTURER'
  | 'CHANNEL_INBOUND'

/** Which destination card a (finer-grained) shipToType belongs to. */
function cardOfShipTo(t: FulfillmentState['shipToType']): DestinationCardType | null {
  if (t === 'SAVED_ADDRESS' || t === 'NEW_ADDRESS') return 'CREATOR_ADDRESS'
  if (t === 'CLOSEST_WAREHOUSE' || t === 'SPECIFIC_WAREHOUSE') return 'WAREHOUSE_PARTNER'
  if (t === 'HOLD_AT_MANUFACTURER') return 'HOLD_AT_MANUFACTURER'
  if (t === 'CHANNEL_INBOUND') return 'CHANNEL_INBOUND'
  return null
}

function ShipToPicker({
  state,
  onChange,
  options,
  destinations,
  labeling,
  effectiveFcOffer,
  loading,
  productId,
  onSavedNewAddress,
}: {
  state: FulfillmentState
  onChange: (patch: Partial<FulfillmentState>) => void
  options: FulfillmentOptions | null
  destinations: DestinationOptionsPayload | null
  labeling: FcLabelingContext | null
  effectiveFcOffer: FcLabelingOffer | null
  loading: boolean
  productId: string
  onSavedNewAddress: () => void
}) {
  const cards: Array<{
    type: DestinationCardType
    label: string
    hint: string
    icon: React.ComponentType<{ className?: string }>
  }> = [
    {
      type: 'CREATOR_ADDRESS',
      label: 'My address',
      hint: 'Ship to a saved or new address you control.',
      icon: Home,
    },
    {
      type: 'WAREHOUSE_PARTNER',
      label: 'Fulfillment center',
      hint: 'We pick the best center and route your run there.',
      icon: Warehouse,
    },
    {
      type: 'HOLD_AT_MANUFACTURER',
      label: 'Keep at manufacturer',
      hint: 'Store the finished run at the producer and ship on demand.',
      icon: Factory,
    },
    {
      type: 'CHANNEL_INBOUND',
      label: 'Ship into my sales channel',
      hint: 'Send inventory straight into Amazon, Walmart, or TikTok.',
      icon: Store,
    },
  ]

  const selectedCard = cardOfShipTo(state.shipToType)

  // Server eligibility per card. While the payload loads (or on failure) the
  // two pre-L1b cards keep working and the new cards stay off — the server
  // re-checks at Pay regardless.
  function optionFor(type: DestinationCardType): {
    enabled: boolean
    disabledReason: string | null
  } {
    const server = destinations?.options.find((o) => o.type === type)
    if (server) return { enabled: server.enabled, disabledReason: server.disabledReason }
    if (type === 'CREATOR_ADDRESS' || type === 'WAREHOUSE_PARTNER') {
      return { enabled: true, disabledReason: null }
    }
    return { enabled: false, disabledReason: null }
  }

  function selectCard(card: DestinationCardType) {
    if (card === selectedCard) return
    if (card === 'CREATOR_ADDRESS') {
      onChange({
        shipToType: 'SAVED_ADDRESS',
        warehousePartnerServiceId: null,
        newAddress: null,
        storageMode: null,
      })
    } else if (card === 'WAREHOUSE_PARTNER') {
      onChange({
        shipToType: 'CLOSEST_WAREHOUSE',
        warehousePartnerServiceId: null,
        savedAddressId: null,
        newAddress: null,
        storageMode: null,
      })
    } else if (card === 'HOLD_AT_MANUFACTURER') {
      onChange({
        shipToType: 'HOLD_AT_MANUFACTURER',
        warehousePartnerServiceId: null,
        savedAddressId: null,
        newAddress: null,
        // Default to whichever mode the partner actually offers.
        storageMode: destinations?.holdOffer?.onDemandAvailable
          ? 'ON_DEMAND'
          : 'STOCK_RELEASE',
      })
    } else if (card === 'CHANNEL_INBOUND') {
      // L3a — default to the first ELIGIBLE connection; the expanded block
      // lets the creator switch. Server re-checks every gate at Pay.
      onChange({
        shipToType: 'CHANNEL_INBOUND',
        warehousePartnerServiceId: null,
        savedAddressId: null,
        newAddress: null,
        storageMode: null,
        channelConnectionId:
          destinations?.channels.find((c) => c.eligible)?.channelConnectionId ?? null,
      })
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((c) => {
          const { enabled, disabledReason } = optionFor(c.type)
          const selected = selectedCard === c.type
          const Icon = c.icon
          return (
            <button
              key={c.type}
              type="button"
              disabled={!enabled}
              aria-disabled={!enabled}
              onClick={enabled ? () => selectCard(c.type) : undefined}
              className={
                'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ' +
                (selected
                  ? 'border-pink-400 bg-pink-50/40 ring-2 ring-pink-200'
                  : enabled
                    ? 'border-ink-200 bg-white hover:bg-ink-50/40'
                    : 'cursor-not-allowed border-ink-200 bg-white opacity-60')
              }
            >
              <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink-900">
                  {c.label}
                </div>
                <div className="text-[11.5px] leading-snug text-ink-500">
                  {c.hint}
                </div>
                {!enabled && disabledReason && (
                  <div className="mt-1 text-[11px] leading-snug text-ink-400">
                    {disabledReason}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Expanded block for the selected destination card */}
      {selectedCard && (
        <div className="rounded-xl border border-ink-100 bg-ink-50/40 p-4">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
          ) : selectedCard === 'CREATOR_ADDRESS' ? (
            <CreatorAddressBlock
              productId={productId}
              state={state}
              onChange={onChange}
              options={options}
              onSavedNewAddress={onSavedNewAddress}
            />
          ) : selectedCard === 'WAREHOUSE_PARTNER' ? (
            <FulfillmentCenterBlock
              state={state}
              onChange={onChange}
              options={options}
              suggestedFc={destinations?.suggestedFc ?? null}
              labeling={labeling}
              effectiveFcOffer={effectiveFcOffer}
            />
          ) : selectedCard === 'CHANNEL_INBOUND' ? (
            <ChannelInboundBlock
              state={state}
              onChange={onChange}
              channels={destinations?.channels ?? []}
            />
          ) : (
            <HoldAtManufacturerBlock
              state={state}
              onChange={onChange}
              offer={destinations?.holdOffer ?? null}
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
    <div className="flex items-start gap-3 rounded-xl border border-ink-200 bg-white p-4">
      <Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-900">
            Standard production
          </span>
          <span className="rounded-full bg-success-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-success-700">
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
    <div className="flex items-start gap-3 rounded-xl border border-ink-200 bg-white p-4">
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
// Sub-blocks — one per destination card (SavedAddress / NewAddress /
// SpecificWarehouse blocks reused from the old FulfillmentStep)
// =============================================================================

// Creator address — SAVED_ADDRESS / NEW_ADDRESS live under one card.
function CreatorAddressBlock({
  productId,
  state,
  onChange,
  options,
  onSavedNewAddress,
}: {
  productId: string
  state: FulfillmentState
  onChange: (patch: Partial<FulfillmentState>) => void
  options: FulfillmentOptions | null
  onSavedNewAddress: () => void
}) {
  const mode = state.shipToType === 'NEW_ADDRESS' ? 'NEW_ADDRESS' : 'SAVED_ADDRESS'
  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="tablist" aria-label="Address source">
        <SubModePill
          active={mode === 'SAVED_ADDRESS'}
          label="Saved address"
          onClick={() => onChange({ shipToType: 'SAVED_ADDRESS', newAddress: null })}
        />
        <SubModePill
          active={mode === 'NEW_ADDRESS'}
          label="New address"
          onClick={() => onChange({ shipToType: 'NEW_ADDRESS', savedAddressId: null })}
        />
      </div>
      {mode === 'SAVED_ADDRESS' ? (
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
  )
}

function SubModePill({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ' +
        (active
          ? 'bg-ink-900 text-white'
          : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50/40')
      }
    >
      {label}
    </button>
  )
}

// Fulfillment center — suggested node up front (L8: creator sees the pick +
// rationale and can override within the eligible set); the specific-warehouse
// picker sits behind a disclosure.
function FulfillmentCenterBlock({
  state,
  onChange,
  options,
  suggestedFc,
  labeling,
  effectiveFcOffer,
}: {
  state: FulfillmentState
  onChange: (patch: Partial<FulfillmentState>) => void
  options: FulfillmentOptions | null
  suggestedFc: SuggestedFcOption | null
  labeling: FcLabelingContext | null
  effectiveFcOffer: FcLabelingOffer | null
}) {
  const choosingOther = state.shipToType === 'SPECIFIC_WAREHOUSE'
  // PS-3c — warehouses with a verified RELABEL offer for this order's method.
  const labelingFcIds = new Set(
    labeling?.needsExternalApplication
      ? labeling.offers.map((o) => o.partnerServiceId)
      : [],
  )
  if (!suggestedFc && (options?.warehouses.length ?? 0) === 0) {
    return (
      <p className="text-sm text-ink-500">
        No active fulfillment centers yet. Pick &ldquo;My address&rdquo; while
        we onboard 3PLs in your region.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {suggestedFc ? (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success-700" />
            <span className="text-ink-800">
              We suggest <strong>{suggestedFc.partnerName}</strong> —{' '}
              {suggestedFc.rationale}
            </span>
            {labelingFcIds.has(suggestedFc.partnerServiceId) && (
              <FcLabelingBadge />
            )}
          </div>
          <p className="text-[11.5px] text-ink-500">
            {suggestedFc.city &&
              `${suggestedFc.city}${suggestedFc.state ? `, ${suggestedFc.state}` : ''}`}
            {suggestedFc.distanceMiles !== null &&
              ` · ~${suggestedFc.distanceMiles} mi from your manufacturer`}
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-500">
          We&rsquo;ll route to the best available center once your order is
          placed.
        </p>
      )}

      <button
        type="button"
        onClick={() =>
          choosingOther
            ? onChange({ shipToType: 'CLOSEST_WAREHOUSE', warehousePartnerServiceId: null })
            : onChange({ shipToType: 'SPECIFIC_WAREHOUSE' })
        }
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <ChevronDown
          className={
            'h-3.5 w-3.5 transition-transform ' + (choosingOther ? 'rotate-180' : '')
          }
        />
        {choosingOther ? 'Use the suggested center' : 'Choose a different center'}
      </button>

      {choosingOther && (
        <SpecificWarehouseBlock
          options={options}
          pickedId={state.warehousePartnerServiceId}
          onPick={(id) => onChange({ warehousePartnerServiceId: id, labelingAtFc: null })}
          labelingFcIds={labelingFcIds}
        />
      )}

      {/* PS-3c (§8.1a) — "Finalize labeling here": ONLY when this order needs
          application downstream of the manufacturer AND the effective FC's
          RELABEL capability is admin-verified for this decoration method.
          Labels never route to an FC by destination — this checkbox is the
          explicit choice that creates the label leg. */}
      {effectiveFcOffer && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-200 bg-white p-3.5">
          <Checkbox
            checked={state.labelingAtFc === true}
            onChange={(e) => onChange({ labelingAtFc: e.target.checked })}
          />
          <span className="min-w-0 text-[12.5px] leading-snug">
            <span className="font-semibold text-ink-900">
              Finalize labeling at this center
            </span>{' '}
            <span className="text-ink-600">
              (+${(effectiveFcOffer.feeCentsPerUnit / 100).toFixed(2)}/unit
              {effectiveFcOffer.minUnits > 1
                ? ` · min ${effectiveFcOffer.minUnits.toLocaleString()} units`
                : ''}
              {` · +${effectiveFcOffer.leadTimeDays} day${effectiveFcOffer.leadTimeDays === 1 ? '' : 's'}`}
              ). Your manufacturer doesn&rsquo;t apply labels for this product —
              this center&rsquo;s verified relabel line will. Otherwise the labels
              ship to the manufacturer for finishing before the run leaves.
            </span>
          </span>
        </label>
      )}
    </div>
  )
}

// PS-3c — capability badge, rendered ONLY next to FCs whose verified RELABEL
// VAS covers this order's decoration method.
function FcLabelingBadge() {
  return (
    <span className="flex-shrink-0 rounded-full bg-pink-50 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-pink-700 ring-1 ring-pink-200">
      Can finalize labeling here
    </span>
  )
}

// Keep at manufacturer — fee card (snapshot of the partner's current storage
// terms) + ON_DEMAND / STOCK_RELEASE mode radio.
function HoldAtManufacturerBlock({
  state,
  onChange,
  offer,
}: {
  state: FulfillmentState
  onChange: (patch: Partial<FulfillmentState>) => void
  offer: HoldStorageOffer | null
}) {
  if (!offer) {
    return (
      <p className="text-sm text-ink-500">
        Storage terms unavailable — refresh the page and try again.
      </p>
    )
  }
  const mode =
    state.storageMode ?? (offer.onDemandAvailable ? 'ON_DEMAND' : 'STOCK_RELEASE')
  return (
    <div className="space-y-3">
      {/* Fee card — these exact terms are snapshotted onto the StorageAgreement */}
      <div className="rounded-xl border border-ink-200 bg-white p-4">
        <div className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
          Storage terms
        </div>
        <dl className="mt-2 space-y-1 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Storage rate</dt>
            <dd className="font-semibold text-ink-900">{formatStorageRate(offer)}</dd>
          </div>
          {offer.freeGraceDays != null && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Free grace period</dt>
              <dd className="font-semibold text-ink-900">
                {offer.freeGraceDays} business days after production
              </dd>
            </div>
          )}
          {mode === 'ON_DEMAND' && offer.pickFeeCents != null && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Pick fee</dt>
              <dd className="font-semibold text-ink-900">
                {formatCents(offer.pickFeeCents)} per order
              </dd>
            </div>
          )}
          {mode === 'ON_DEMAND' && offer.packFeeCents != null && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Pack fee</dt>
              <dd className="font-semibold text-ink-900">
                {formatCents(offer.packFeeCents)} per order
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-2 text-[11px] leading-snug text-ink-500">
          Billed monthly once the run lands in storage. Rates are locked when
          you place this order.
        </p>
      </div>

      {/* Mode radio */}
      <div role="radiogroup" aria-label="Storage mode" className="grid gap-2 sm:grid-cols-2">
        <StorageModeCard
          label="Ship on demand"
          hint="The manufacturer picks, packs, and parcels each order as it comes in."
          selected={mode === 'ON_DEMAND'}
          disabled={!offer.onDemandAvailable}
          disabledReason="This manufacturer can't ship parcels on demand."
          onClick={() => onChange({ storageMode: 'ON_DEMAND' })}
        />
        <StorageModeCard
          label="Stock release"
          hint="Stored as pallets — release chunks to an address or center when you need them."
          selected={mode === 'STOCK_RELEASE'}
          disabled={!offer.stockReleaseAvailable}
          disabledReason="Stock release is not offered by this manufacturer."
          onClick={() => onChange({ storageMode: 'STOCK_RELEASE' })}
        />
      </div>
    </div>
  )
}

// Ship into my sales channel (Phase L3a) — one radio card per CONNECTED
// connection. Ineligible connections render disabled with the server's
// gate-failure copy VERBATIM. The concrete FC address is assigned by the
// channel at inbound-plan confirmation, so no address entry happens here.
function ChannelInboundBlock({
  state,
  onChange,
  channels,
}: {
  state: FulfillmentState
  onChange: (patch: Partial<FulfillmentState>) => void
  channels: ChannelInboundOption[]
}) {
  if (channels.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No connected sales channels yet. Link your seller account in Settings →
        Channels first.
      </p>
    )
  }
  const pickedId = state.channelConnectionId ?? null
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Sales channel" className="grid gap-2 sm:grid-cols-2">
        {channels.map((c) => {
          const selected = pickedId === c.channelConnectionId
          return (
            <button
              key={c.channelConnectionId}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!c.eligible}
              onClick={
                c.eligible
                  ? () => onChange({ channelConnectionId: c.channelConnectionId })
                  : undefined
              }
              className={
                'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ' +
                (selected
                  ? 'border-pink-400 bg-pink-50/40 ring-2 ring-pink-200'
                  : c.eligible
                    ? 'border-ink-200 bg-white hover:bg-ink-50/40'
                    : 'cursor-not-allowed border-ink-200 bg-white opacity-60')
              }
            >
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink-900">{c.channelName}</div>
                {c.externalAccountId && (
                  <div className="text-[11px] font-mono text-ink-500">
                    {c.externalAccountId}
                  </div>
                )}
                {!c.eligible &&
                  c.reasons.map((r) => (
                    <div key={r} className="mt-1 text-[11px] leading-snug text-ink-400">
                      {r}
                    </div>
                  ))}
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] leading-snug text-ink-500">
        The channel assigns its receiving fulfillment center(s) when the inbound
        plan is confirmed — box and pallet labels are generated for your
        manufacturer at that point.
      </p>
    </div>
  )
}

function StorageModeCard({
  label,
  hint,
  selected,
  disabled,
  disabledReason,
  onClick,
}: {
  label: string
  hint: string
  selected: boolean
  disabled: boolean
  disabledReason: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ' +
        (selected
          ? 'border-pink-400 bg-pink-50/40 ring-2 ring-pink-200'
          : disabled
            ? 'cursor-not-allowed border-ink-200 bg-white opacity-60'
            : 'border-ink-200 bg-white hover:bg-ink-50/40')
      }
    >
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink-900">{label}</div>
        <div className="text-[11.5px] leading-snug text-ink-500">{hint}</div>
        {disabled && (
          <div className="mt-1 text-[11px] leading-snug text-ink-400">
            {disabledReason}
          </div>
        )}
      </div>
    </button>
  )
}

function formatStorageRate(offer: HoldStorageOffer): string {
  if (offer.rateCents == null) return 'Set at agreement'
  const unit = offer.billingUnit === 'CUFT_MONTH' ? 'cu ft / month' : 'pallet / month'
  return `${formatCents(offer.rateCents)} per ${unit}`
}

function SpecificWarehouseBlock({
  options,
  pickedId,
  onPick,
  labelingFcIds,
}: {
  options: FulfillmentOptions | null
  pickedId: string | null
  onPick: (id: string) => void
  labelingFcIds: Set<string>
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
          canFinalizeLabeling={labelingFcIds.has(w.id)}
        />
      ))}
    </div>
  )
}

function WarehouseCard({
  warehouse,
  selected,
  onClick,
  canFinalizeLabeling = false,
}: {
  warehouse: WarehouseOption
  selected: boolean
  onClick: () => void
  canFinalizeLabeling?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition-colors ' +
        (selected
          ? 'border-pink-400 bg-pink-50/40 ring-2 ring-pink-200'
          : 'border-ink-200 bg-white hover:bg-ink-50/40')
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-ui-value text-ink-900">
            {warehouse.partnerName}
          </span>
          {canFinalizeLabeling && <FcLabelingBadge />}
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
        'flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition-colors ' +
        (selected
          ? 'border-pink-400 bg-pink-50/40 ring-2 ring-pink-200'
          : 'border-ink-200 bg-white hover:bg-ink-50/40')
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-ui-value text-ink-900">{address.label}</span>
          {address.isDefault && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-warning-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-warning-800">
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
            className="block w-full rounded-xl border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </Field>
        <Field label="Recipient name *" htmlFor={`${fieldId}-name`}>
          <input
            id={`${fieldId}-name`}
            type="text"
            required
            value={addr.contactName}
            onChange={(e) => setField('contactName', e.target.value)}
            className="block w-full rounded-xl border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </Field>
        <Field label="Phone (optional)" htmlFor={`${fieldId}-phone`}>
          <input
            id={`${fieldId}-phone`}
            type="tel"
            autoComplete="tel"
            value={addr.contactPhone ?? ''}
            onChange={(e) => setField('contactPhone', e.target.value)}
            className="block w-full rounded-xl border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </Field>
        <Field label="Country" htmlFor={`${fieldId}-country`}>
          <input
            id={`${fieldId}-country`}
            type="text"
            autoComplete="country"
            value={addr.country}
            onChange={(e) => setField('country', e.target.value)}
            className="block w-full rounded-xl border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
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
            className="block w-full rounded-xl border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </Field>
        <Field label="State / region" htmlFor={`${fieldId}-state`}>
          <input
            id={`${fieldId}-state`}
            type="text"
            autoComplete="address-level1"
            value={addr.state ?? ''}
            onChange={(e) => setField('state', e.target.value)}
            className="block w-full rounded-xl border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
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
            className="block w-full rounded-xl border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Checkbox
          checked={state.saveNewAddress}
          onChange={(e) => onChange({ saveNewAddress: e.target.checked })}
          label="Save to my address book for next time"
          className="text-xs text-ink-700"
        />
        {state.saveNewAddress && (
          <button
            type="button"
            onClick={persist}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> Save address
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
        className="block text-[12px] font-bold uppercase tracking-widest text-ink-700"
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
        'rounded-xl border p-4 ' +
        (acknowledged
          ? 'border-warning-300 bg-warning-50/60'
          : 'border-pink-500 bg-pink-50')
      }
    >
      <div className="flex items-start gap-2.5">
        <AlertOctagon
          aria-hidden="true"
          className={
            'mt-0.5 h-4 w-4 flex-shrink-0 ' +
            (acknowledged ? 'text-warning-700' : 'text-pink-700')
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
                  ? 'border-warning-500 bg-warning-500'
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
