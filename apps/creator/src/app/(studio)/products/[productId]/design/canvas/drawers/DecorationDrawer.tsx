'use client'

// DecorationDrawer — #22 split model (2026-07-19, Pavel). The creator picks the
// CONTAINER on the marketplace detail page; they pick the DECORATION METHOD here in
// the Studio, beside the material picker (F3b) and the die-line they design against.
//
// Unlike Material (which writes the CheckoutDraft), decoration is a REAL model field
// AND money: it pins the chosen PartnerPackagingOffering onto the product's PRIMARY
// container, and @ilaunchify/plans priceComponents prices decoration off that
// offering's tiers, which is what checkout charges and what routing pays the printer.
// Pick here, and checkout shows the decoration line and the printer gets paid it.
//
// Self-loading: the options depend on THIS product's container, so the drawer fetches
// both the options and the current pin via getDesignDecoration on mount, rather than
// threading catalogs down from the page.

import * as React from 'react'
import { Stamp, Check, Loader2 } from 'lucide-react'
import { getDesignDecoration, setDesignDecoration, type DecorationOption } from '../decoration-actions'

const FULFILLMENT_TAG: Record<string, { label: string; cls: string }> = {
  BULK_PRODUCTION: { label: 'Bulk', cls: 'bg-ink-900 text-white' },
  ON_DEMAND: { label: 'On-demand', cls: 'bg-pink-100 text-pink-700' },
  BOTH: { label: 'Flexible', cls: 'bg-neon-500 text-ink-900' },
}

function OptionRow({
  opt,
  selected,
  onPick,
  disabled,
}: {
  opt: DecorationOption
  selected: boolean
  onPick: () => void
  disabled: boolean
}) {
  const tag = FULFILLMENT_TAG[opt.fulfillmentMode] ?? FULFILLMENT_TAG.BOTH!
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      disabled={disabled}
      className={`flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
        selected
          ? 'border-pink-500 bg-pink-50/60 ring-1 ring-pink-500'
          : 'border-ink-200 bg-white hover:border-ink-300'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-300 bg-white'
        }`}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold text-ink-900">{opt.methodLabel}</span>
          <span
            className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tag.cls}`}
          >
            {tag.label}
          </span>
        </span>
        <span className="mt-1 block text-[13px] font-bold tabular-nums text-ink-900">
          ${(opt.startingPricePerUnitCents / 100).toFixed(2)}
          <span className="ml-1 text-[10.5px] font-medium text-ink-500">/ unit start</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-ink-500">
          <span>MOQ {opt.moq.toLocaleString()}</span>
          <span className="text-ink-300">·</span>
          <span>{opt.leadTimeDays}-day lead</span>
        </span>
      </span>
    </button>
  )
}

export function DecorationDrawer({ productId }: { productId: string }) {
  const [options, setOptions] = React.useState<DecorationOption[]>([])
  const [selectedOfferingId, setSelectedOfferingId] = React.useState<string | null>(null)
  const [containerName, setContainerName] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)

  React.useEffect(() => {
    let alive = true
    getDesignDecoration(productId).then((r) => {
      if (!alive) return
      if (r.ok) {
        setOptions(r.options)
        setSelectedOfferingId(r.selectedOfferingId)
        setContainerName(r.containerName)
      }
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [productId])

  const pick = React.useCallback(
    async (offeringId: string) => {
      // Toggle off a selected method clears it (undecorated), a legitimate state,
      // checkout blocks again and points back here. Never substitute a default.
      const next = selectedOfferingId === offeringId ? null : offeringId
      setSelectedOfferingId(next)
      setSaving(true)
      const r = await setDesignDecoration({ productId, offeringId: next })
      setSaving(false)
      if (r.ok) setSavedAt(Date.now())
    },
    [productId, selectedOfferingId],
  )

  const chosen = options.find((o) => o.offeringId === selectedOfferingId) ?? null

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-1.5">
          <Stamp className="h-4 w-4 text-ink-700" />
          <h3 className="text-[13px] font-semibold text-ink-900">Decoration method</h3>
        </div>
        <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-600">
          How your {containerName ? containerName.toLowerCase() : 'container'} is finished.
          This sets the die-line you design against and the per-unit decoration price
          on your order.
        </p>
      </div>

      {!loaded ? (
        <div className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading decoration options...</span>
        </div>
      ) : options.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-200 bg-ink-50/60 p-4">
          <div className="flex items-start gap-2.5">
            <Stamp className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
            <div>
              <div className="text-[12.5px] font-bold text-ink-900">No decoration options</div>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-600">
                This container has no published decoration offerings yet. Your order
                ships undecorated until a partner publishes one.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div role="radiogroup" aria-label="Decoration method" className="space-y-1.5">
          {options.map((o) => (
            <OptionRow
              key={o.offeringId}
              opt={o}
              selected={selectedOfferingId === o.offeringId}
              onPick={() => void pick(o.offeringId)}
              disabled={!loaded || saving}
            />
          ))}
        </div>
      )}

      {options.length > 0 && (
        <div className="flex items-center gap-1.5 border-t border-ink-100 pt-3 text-[11.5px]">
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-ink-500" />
              <span className="text-ink-500">Saving...</span>
            </>
          ) : chosen ? (
            <>
              <Check className="h-3.5 w-3.5 text-success-600" strokeWidth={3} />
              <span className="font-medium text-success-700">
                {chosen.methodLabel} set. Checkout will price it for your quantity.
              </span>
            </>
          ) : (
            <span className="font-medium text-ink-500">
              {savedAt ? 'Cleared. ' : ''}Pick a decoration method, or leave it undecorated.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
