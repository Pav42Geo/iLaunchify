'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Button,
  FlavorSwatch,
  PackagingPicker,
  EarningsCalculator,
  ShippingInfoCard,
  PricingTierModal,
  buildSamplePricingRows,
} from '@ilaunchify/ui'
import type { SampleTemplate } from '@/lib/sample-templates'
import type { TemplateDetail } from '@/lib/template-detail'
import { LaunchCtaCluster } from './LaunchCtaCluster'

/**
 * ProductDetailConfigurator — the right-column variant + pricing + CTA stack
 * on the ProductTemplate detail page.
 *
 * Composes:
 *   - FlavorSwatch  (admin-curated flavor presets)
 *   - Size pills    (240g / 480g / 720g — from detail.sizeChart)
 *   - PackagingPicker (admin-curated packaging variants)
 *   - Quantity input with band-aware pricing
 *   - Pricing panel + "See pricing by tier" affordance
 *   - EarningsCalculator (cost → retail → margin)
 *   - ShippingInfoCard
 *   - "Start launching" + "Sample order" CTAs (server-routed)
 *
 * V1 demo only — once the variant matrix flows from Prisma + the routing
 * engine produces real landed cost, the price math here gets replaced with
 * `useLandedCostQuery({ templateId, flavorId, sizeKey, packagingId, quantity })`.
 */
export interface ProductDetailConfiguratorProps {
  template: SampleTemplate
  detail: TemplateDetail
  /** When true, "Start launching" goes straight to the Design Studio with the
   * selection carried as query params. When false (default), it lands on
   * /start, which converts the visitor into a signed-up creator first. */
  isAuthenticated?: boolean
}

export function ProductDetailConfigurator({
  template,
  detail,
  isAuthenticated = false,
}: ProductDetailConfiguratorProps) {
  const sizeOptions = detail.sizeChart.map((s) => s.size)

  const [flavorId, setFlavorId] = React.useState<string>(
    detail.flavors[0]?.id ?? '',
  )
  const [sizeKey, setSizeKey] = React.useState<string>(sizeOptions[0] ?? '')
  const [packagingId, setPackagingId] = React.useState<string>(
    detail.packaging.find((p) => !p.unavailable)?.id ?? detail.packaging[0]?.id ?? '',
  )
  const [quantity, setQuantity] = React.useState<number>(template.minUnits)

  // ----- Pricing math (V1 demo) -----
  // Base unit price from the marketplace card, scaled by the quantity-band
  // factor used in buildSamplePricingRows, then bumped by packaging delta
  // and size factor.
  const rows = React.useMemo(
    () => buildSamplePricingRows(template.pricePerUnit),
    [template.pricePerUnit],
  )

  const matchedRow = React.useMemo(() => {
    const eligible = rows.filter(
      (r) => r.bandMin !== null && r.bandMin <= quantity,
    )
    return eligible.length > 0 ? eligible[eligible.length - 1]! : rows[0]!
  }, [rows, quantity])

  // Maker is the default tier in V1 demo (logged-out / new creator).
  const currentTier = 'maker' as const

  const packagingDelta =
    detail.packaging.find((p) => p.id === packagingId)?.priceDelta ?? 0

  // Larger sizes get a small per-unit cost bump (rough demo math).
  const sizeIndex = Math.max(0, sizeOptions.indexOf(sizeKey))
  const sizeMultiplier = 1 + sizeIndex * 0.85

  const baseCost = matchedRow.prices[currentTier]
  const landedCost = +(baseCost * sizeMultiplier + packagingDelta).toFixed(2)
  const totalOrderCost = +(landedCost * quantity).toFixed(2)

  // Lead time from the chosen packaging (falls back to template default).
  const leadTimeDays =
    detail.packaging.find((p) => p.id === packagingId)?.leadTimeDays ??
    template.leadTimeDays

  return (
    <div className="flex flex-col gap-5">
      {/* Variant pickers */}
      {detail.flavors.length > 0 && (
        <FlavorSwatch
          options={detail.flavors}
          value={flavorId}
          onChange={setFlavorId}
        />
      )}

      {sizeOptions.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
            Size{' '}
            <span className="text-ink-700 normal-case font-normal tracking-normal">
              · {sizeKey}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sizeOptions.map((s) => {
              const isActive = s === sizeKey
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSizeKey(s)}
                  aria-pressed={isActive}
                  className={
                    'px-4 h-9 rounded-pill text-[13px] font-semibold border transition-[border-color,background-color,color] duration-base ease-out-quart cursor-pointer ' +
                    (isActive
                      ? 'bg-ink-900 text-white border-ink-900'
                      : 'bg-white text-ink-900 border-ink-300 hover:border-ink-500')
                  }
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <PackagingPicker
        options={detail.packaging}
        value={packagingId}
        onChange={setPackagingId}
      />

      {/* Quantity + per-unit price */}
      <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border border-ink-200 bg-white">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-1.5 block">
            Quantity
          </label>
          <input
            type="number"
            min={template.minUnits}
            step={50}
            value={quantity}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setQuantity(Number.isFinite(v) ? Math.max(0, v) : 0)
            }}
            className="w-full h-10 px-3 rounded-md border border-ink-300 bg-white text-[15px] font-semibold text-ink-900 focus:outline-none focus:border-pink-500 focus:ring-[3px] focus:ring-pink-500/15 transition-[border-color,box-shadow] tabular-nums"
          />
          <div className="text-[11px] text-ink-500 mt-1 tabular-nums">
            min {template.minUnits} units · {matchedRow.band}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-1.5">
            Landed cost
          </div>
          <div className="text-2xl font-bold text-ink-900 leading-none tabular-nums">
            ${landedCost.toFixed(2)}
            <span className="text-ink-500 text-[13px] font-medium ml-1.5">
              / unit
            </span>
          </div>
          <div className="text-[12px] text-ink-500 mt-1 tabular-nums">
            ${totalOrderCost.toFixed(2)} total
          </div>
        </div>
        <div className="col-span-2 -mt-1">
          <PricingTierModal
            productName={template.title}
            variantName={`${sizeKey} · ${
              detail.packaging.find((p) => p.id === packagingId)?.name ?? ''
            }`}
            rows={rows}
            currentTier={currentTier}
            currentQuantity={quantity}
          />
        </div>
      </div>

      <EarningsCalculator costPerUnit={landedCost} />

      <ShippingInfoCard
        serviceLabel={`${leadTimeDays}-day production`}
        cost={0}
        marketLabel="United States"
        marketFlag="🇺🇸"
        leadTimeLabel={`${leadTimeDays}–${leadTimeDays + 4} days door-to-door`}
      />

      {/* Primary CTAs — REBUILD R5 wires Open in Design Studio to a
       * server action that materialises the Product row + redirects
       * cross-app to /products/{id}/design/canvas. Guests get bounced
       * to /signup with the selection preserved (R4 polishes with a
       * modal).
       */}
      <LaunchCtaCluster
        templateSlug={template.slug}
        flavorId={flavorId}
        sizeKey={sizeKey}
        packagingId={packagingId}
        quantity={quantity}
        isAuthenticated={isAuthenticated}
      />
    </div>
  )
}
