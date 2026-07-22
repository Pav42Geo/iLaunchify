'use client'

import * as React from 'react'
import { productGradient, type ProductGradient } from '@ilaunchify/ui'
import type { SampleTemplate } from '@/lib/sample-templates'
import type { TemplateDetail } from '@/lib/template-detail'
import type { PricingTierRow, PackBuilderFlavor } from '@ilaunchify/ui'
import type { FeeRuleBounds } from '@ilaunchify/plans/math'
import type { SampleOption } from '@/lib/sample-quote'
import { ProductDetailConfigurator } from './ProductDetailConfigurator'
import { BusinessPromoCard } from './BusinessPromoCard'
import { SampleDrawer } from './SampleDrawer'

/**
 * ProductDetailHero — the PDP redesign's 3-zone hero (client root).
 *
 * Desktop grid: gallery (1.15fr) · identity (1fr) · zone3 (380px configure box +
 * business card). Collapses to a single stacked column under ~1000px so the
 * mobile/tablet experience is the stacked version.
 *
 * Owns the selected-packaging state so the gallery main image can follow the
 * chosen package — when per-package image data exists. PackagingOption may now
 * carry an `imageUrl` (resolved server-side from the linked PackagingSystem); when
 * the selected option has one, the gallery hero swaps to it. Options without an
 * imageUrl (fixture-only demos, packages with no photo) leave the gallery exactly
 * as it was — real images, else emoji+gradient.
 *
 * The identity column is server-rendered content passed in as `identity` (so the
 * page keeps its server/client boundary clean: taxonomy chips, accordion bodies,
 * spec grid all stay server-derived).
 */
export interface ProductDetailHeroProps {
  template: SampleTemplate
  detail: TemplateDetail
  /** Real product images (hero first); [] → emoji+gradient fallback. */
  images: string[]
  /** Server-rendered identity column (eyebrow, title, certs, chips, accordion). */
  identity: React.ReactNode
  /** Content that flows UNDER the gallery+identity columns (e.g. the product
   *  tabs), spanning only those two columns so the tall sticky right rail stays
   *  visible beside it while scrolling. Stacks below everything on mobile. */
  belowFold?: React.ReactNode

  // ----- configurator props (passed straight through) -----
  pricingRows: PricingTierRow[]
  /** On-demand band rows, DISPLAY-ONLY (2026-07-20). Present only when the
   *  manufacturer authored them AND the template passes the full-service gate;
   *  wakes the configurator's Bulk/On-demand price toggle. */
  onDemandRows?: PricingTierRow[]
  viewerTier?: 'maker' | 'builder' | 'agency'
  isAuthenticated?: boolean
  feePctByTier?: { maker: number; builder: number; agency: number }
  /** PP-0c: tier rate (bps) + FeeRule bounds, resolved server-side via the fee
      SSOT and forwarded to the configurator, which prices with them. */
  platformFeeBps?: number
  platformFeeBounds?: FeeRuleBounds
  flavorMode?: 'SINGLE' | 'MULTI'
  maxFlavorsPerPack?: number | null
  flavorPool?: PackBuilderFlavor[]
  changeoverDays?: number
  /** Product STANDARD (global) lead — GLOBAL FLOOR (docs/PER_FLAVOR_RECIPES.md §4).
   *  Forwarded to the configurator for the effective lead. */
  standardLead?: number | null
  flavorPricing?: Record<
    string,
    { priceDeltaCents: number; saleDeltaCents: number | null }
  >
  // Variety-pack model (docs/VARIETY_PACK_MODEL.md) — passed straight through to
  // the configurator's multi-flavor pack flow.
  packSizes?: {
    variantId: string
    unitsPerPack: number
    label: string
    pricePerPackCents: number | null
    moqPacks: number | null
  }[]
  minFlavors?: number | null
  fillRule?: 'CREATOR_CHOOSES' | 'EVEN_AUTO' | 'MANUFACTURER_FIXED' | null
  pricingBasis?: 'PER_FLAVOR' | 'PER_PACK' | null
  flavorUnitPriceCents?: Record<string, number | null>
  // §8 per-bucket rollout — passed straight through to the configurator.
  structuralType?: import('@ilaunchify/ui').StructuralPackType | null
  flavorPolicy?: 'CREATOR_PICK' | 'PARTNER_FIXED' | null
  assortment?: import('@ilaunchify/ui').AssortmentEntry[]
  fixedDistribution?: import('@ilaunchify/ui').FixedDistribution | null
  // #38 — scoped PDP packaging options, passed straight through to the configurator.
  packagingOptions?: import('@/lib/container-offerings-db').PdpPackagingOption[]

  // ----- sample drawer props (null sample → no sample button) -----
  sample?: {
    options: SampleOption[]
    flavorNames: string[]
    isMultiFlavor: boolean
    dielineReady: boolean
    ownedProductId: string | null
  } | null
}

export function ProductDetailHero({
  template,
  detail,
  images,
  identity,
  belowFold,
  pricingRows,
  onDemandRows,
  viewerTier,
  isAuthenticated = false,
  feePctByTier,
  platformFeeBps,
  platformFeeBounds,
  flavorMode,
  maxFlavorsPerPack,
  flavorPool,
  changeoverDays,
  standardLead,
  flavorPricing,
  packSizes,
  minFlavors,
  fillRule,
  pricingBasis,
  flavorUnitPriceCents,
  structuralType,
  flavorPolicy,
  assortment,
  fixedDistribution,
  packagingOptions,
  sample,
}: ProductDetailHeroProps) {
  // Bundle the variety-pack model props once — passed through to both
  // configurator call sites (sample-wrapped + bare).
  const packProps = { packSizes, minFlavors, fillRule, pricingBasis, flavorUnitPriceCents, structuralType, flavorPolicy, assortment, fixedDistribution, packagingOptions }
  // Selected packaging — drives the per-package hero image when one exists.
  const [selectedPackagingId, setSelectedPackagingId] = React.useState<string>(
    detail.packaging.find((p) => !p.unavailable)?.id ?? detail.packaging[0]?.id ?? '',
  )
  // Per-flavor hero (task #203) — the configurator reports the URL of the flavor
  // hero to show (hovered flavor's hero, else last-picked, else null). When set,
  // it takes priority over the package image in the gallery; null falls back.
  const [flavorHeroUrl, setFlavorHeroUrl] = React.useState<string | null>(null)

  // ZONE 1 image resolution. When the selected package carries a resolved
  // imageUrl (server-side, from its PackagingSystem), the gallery shows it as the
  // hero; otherwise the gallery falls back to its existing logic (real images,
  // else emoji+gradient). `undefined` → no swap.
  const selectedPackageImage = detail.packaging.find((p) => p.id === selectedPackagingId)?.imageUrl

  // The flavor hero (when a flavor with an uploaded hero is hovered/picked) wins
  // over the package image; otherwise the package image (then the product hero).
  const galleryHeroImage = flavorHeroUrl ?? selectedPackageImage

  return (
    // Outer: on mobile a simple vertical stack; on desktop a 2-col grid
    // [left | 380px rail]. The LEFT cell is its OWN nested grid (gallery+identity
    // row, tabs row 2), so the tab strip's top is anchored to the gallery/identity
    // row height ONLY. Previously the rail spanned both rows of a single 3-col
    // grid; CSS grid redistributes a tall spanning item's height across the rows it
    // spans, so a short tab (e.g. Compliance) let row 1 grow and the tab strip
    // visibly jumped down on tab switch. Splitting the rail into its own
    // non-spanning column removes that coupling.
    <section className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-x-[26px]">
      {/* LEFT — gallery + identity (+ tabs below). `contents` on mobile so the
          three flow straight into the section stack (letting the buy-box rail sit
          between identity and tabs via order); a nested grid on desktop. */}
      <div className="contents lg:grid lg:grid-cols-[1.15fr_1fr] lg:items-start lg:gap-x-[26px] lg:gap-y-10 lg:col-start-1 lg:row-start-1">
        {/* ZONE 1 — gallery (nested col 1, row 1) */}
        <div className="order-1 lg:order-none lg:col-start-1 lg:row-start-1">
          <HeroGallery template={template} images={images} packageImage={galleryHeroImage} />
        </div>

        {/* ZONE 2 — identity (nested col 2, row 1) */}
        <div className="order-2 flex flex-col lg:order-none lg:col-start-2 lg:row-start-1">{identity}</div>

        {/* Below-fold content (product tabs) — nested row 2 under both left
            columns, so its top sits just under the gallery/identity row and never
            moves when the active tab's height changes. Mobile: last (order-4). */}
        {belowFold && (
          <div className="order-4 min-w-0 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-2">{belowFold}</div>
        )}
      </div>

      {/* ZONE 3 — configure box + business card (right 380px column, sticky).
          Mobile: sits between identity and the tabs (order-3). */}
      <div className="order-3 self-start lg:order-none lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24">
        {sample ? (
          <SampleDrawer
            options={sample.options}
            flavorNames={sample.flavorNames}
            isMultiFlavor={sample.isMultiFlavor}
            dielineReady={sample.dielineReady}
            isAuthenticated={isAuthenticated}
            templateSlug={template.slug}
            ownedProductId={sample.ownedProductId}
            trigger={(open) => (
              <ProductDetailConfigurator
                template={template}
                detail={detail}
                pricingRows={pricingRows}
                onDemandRows={onDemandRows}
                viewerTier={viewerTier}
                isAuthenticated={isAuthenticated}
                feePctByTier={feePctByTier}
                platformFeeBps={platformFeeBps}
                platformFeeBounds={platformFeeBounds}
                flavorMode={flavorMode}
                maxFlavorsPerPack={maxFlavorsPerPack}
                flavorPool={flavorPool}
                changeoverDays={changeoverDays}
                standardLead={standardLead}
                flavorPricing={flavorPricing}
                {...packProps}
                onPackagingChange={setSelectedPackagingId}
                onFlavorHeroChange={setFlavorHeroUrl}
                onOpenSample={open}
              />
            )}
          />
        ) : (
          <ProductDetailConfigurator
            template={template}
            detail={detail}
            pricingRows={pricingRows}
            onDemandRows={onDemandRows}
            viewerTier={viewerTier}
            isAuthenticated={isAuthenticated}
            feePctByTier={feePctByTier}
            flavorMode={flavorMode}
            maxFlavorsPerPack={maxFlavorsPerPack}
            flavorPool={flavorPool}
            changeoverDays={changeoverDays}
            standardLead={standardLead}
            flavorPricing={flavorPricing}
            {...packProps}
            onPackagingChange={setSelectedPackagingId}
            onFlavorHeroChange={setFlavorHeroUrl}
          />
        )}

        <BusinessPromoCard />
      </div>
    </section>
  )
}

/** ZONE 1 — vertical thumbnails + main image. Real images or emoji+gradient.
 *  When `packageImage` is set (the selected package has a resolved photo), it
 *  takes over the hero (and shows as the active leading thumbnail) without
 *  disturbing the existing gallery; clearing it falls back to the prior image. */
function HeroGallery({
  template,
  images,
  packageImage,
}: {
  template: SampleTemplate
  images: string[]
  packageImage?: string
}) {
  const hasImages = images.length > 0
  const mainGradient = (template.gradient ?? 'mint') as ProductGradient
  const gradientThumbs: ProductGradient[] = ['lime', 'pink', 'cyan', 'yellow']
  const [activeIndex, setActiveIndex] = React.useState(0)

  // A package image is showing → it owns the hero (no thumbnail selected from the
  // real-image set). Clicking any thumbnail returns to the gallery image.
  const [showPackage, setShowPackage] = React.useState(true)
  // When the selected package changes (new url, or cleared), reset to showing it.
  React.useEffect(() => {
    setShowPackage(true)
  }, [packageImage])
  const packageActive = Boolean(packageImage) && showPackage

  return (
    // NOT sticky — the tabs now flow under this column, so a sticky gallery would
    // float over them. Only the right configure rail stays sticky.
    <div className="lg:self-start">
      <div className="flex gap-2.5">
        {/* Thumbnails */}
        <div className="flex flex-shrink-0 flex-col gap-2">
          {/* Selected-package thumbnail (only when a package image exists). */}
          {packageImage && (
            <button
              type="button"
              onClick={() => setShowPackage(true)}
              aria-label="View selected packaging"
              className={
                'h-14 w-14 overflow-hidden rounded-[10px] border transition-colors ' +
                (packageActive
                  ? 'border-2 border-ink-900'
                  : 'border border-ink-200 hover:border-pink-500')
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={packageImage} alt="" className="h-full w-full object-cover" />
            </button>
          )}
          {hasImages
            ? images.slice(0, 4).map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setShowPackage(false)
                    setActiveIndex(i)
                  }}
                  aria-label={`View image ${i + 1}`}
                  className={
                    'h-14 w-14 overflow-hidden rounded-[10px] border transition-colors ' +
                    (!packageActive && i === activeIndex
                      ? 'border-2 border-ink-900'
                      : 'border border-ink-200 hover:border-pink-500')
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))
            : gradientThumbs.map((g) => (
                <button
                  key={g}
                  type="button"
                  className="h-14 w-14 rounded-[10px] border border-ink-200 transition-colors hover:border-pink-500"
                  style={{ background: productGradient[g] }}
                  aria-label={`Color variant ${g}`}
                />
              ))}
        </div>

        {/* Main image */}
        <div
          className="flex aspect-square flex-1 items-center justify-center overflow-hidden rounded-[var(--card-radius)] border border-[var(--card-border)]"
          style={packageActive || hasImages ? undefined : { background: productGradient[mainGradient] }}
        >
          {packageActive ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={packageImage}
              alt={`${template.title} — selected packaging`}
              className="h-full w-full object-cover transition-opacity duration-base ease-out-quart"
            />
          ) : hasImages ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={images[activeIndex] ?? images[0]}
              alt={template.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              className="text-[120px] leading-none"
              style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.12))' }}
              aria-hidden="true"
            >
              {template.icon}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
