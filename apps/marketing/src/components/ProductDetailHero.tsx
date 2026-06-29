'use client'

import * as React from 'react'
import { productGradient, type ProductGradient } from '@ilaunchify/ui'
import type { SampleTemplate } from '@/lib/sample-templates'
import type { TemplateDetail } from '@/lib/template-detail'
import type { PricingTierRow, PackBuilderFlavor } from '@ilaunchify/ui'
import type { SampleOption } from '@/lib/sample-quote'
import { ProductDetailConfigurator } from './ProductDetailConfigurator'
import { BusinessPromoCard } from './BusinessPromoCard'
import { SampleDrawer } from './SampleDrawer'

/**
 * ProductDetailHero — the PDP redesign's 3-zone hero (client root).
 *
 * Desktop grid: gallery (1.15fr) · identity (1fr) · zone3 (340px configure box +
 * business card). Collapses to a single stacked column under ~1000px so the
 * mobile/tablet experience is the stacked version.
 *
 * Owns the selected-packaging state so the gallery main image can follow the
 * chosen package — BUT only when per-package image data exists. PackagingOption
 * carries no image field today (only an emoji glyph), so the image does not
 * actually swap yet (see the per-package-image TODO). The wiring is in place for
 * when that data lands.
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

  // ----- configurator props (passed straight through) -----
  pricingRows: PricingTierRow[]
  viewerTier?: 'maker' | 'builder' | 'agency'
  isAuthenticated?: boolean
  feePctByTier?: { maker: number; builder: number; agency: number }
  flavorMode?: 'SINGLE' | 'MULTI'
  maxFlavorsPerPack?: number | null
  flavorPool?: PackBuilderFlavor[]
  changeoverDays?: number
  flavorPricing?: Record<
    string,
    { priceDeltaCents: number; saleDeltaCents: number | null }
  >

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
  pricingRows,
  viewerTier,
  isAuthenticated = false,
  feePctByTier,
  flavorMode,
  maxFlavorsPerPack,
  flavorPool,
  changeoverDays,
  flavorPricing,
  sample,
}: ProductDetailHeroProps) {
  // Selected packaging — wired for a future per-package hero image.
  const [selectedPackagingId, setSelectedPackagingId] = React.useState<string>(
    detail.packaging.find((p) => !p.unavailable)?.id ?? detail.packaging[0]?.id ?? '',
  )

  // ZONE 1 image resolution. PackagingOption has no image/imageUrl field, so we
  // can't swap the hero per package from real data yet.
  // TODO follow-up: per-package hero image (needs data) — when PackagingOption
  // gains an imageUrl, pick `detail.packaging.find(p => p.id === selectedPackagingId)?.imageUrl`
  // here and prefer it over `images[0]`.
  void selectedPackagingId

  return (
    <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.15fr_1fr_340px] lg:gap-[26px]">
      {/* ZONE 1 — gallery */}
      <HeroGallery template={template} images={images} />

      {/* ZONE 2 — identity (server-rendered) */}
      <div className="flex flex-col">{identity}</div>

      {/* ZONE 3 — configure box + business card */}
      <div className="self-start lg:sticky lg:top-24">
        {sample ? (
          <SampleDrawer
            options={sample.options}
            flavorNames={sample.flavorNames}
            isMultiFlavor={sample.isMultiFlavor}
            dielineReady={sample.dielineReady}
            isAuthenticated={isAuthenticated}
            ownedProductId={sample.ownedProductId}
            trigger={(open) => (
              <ProductDetailConfigurator
                template={template}
                detail={detail}
                pricingRows={pricingRows}
                viewerTier={viewerTier}
                isAuthenticated={isAuthenticated}
                feePctByTier={feePctByTier}
                flavorMode={flavorMode}
                maxFlavorsPerPack={maxFlavorsPerPack}
                flavorPool={flavorPool}
                changeoverDays={changeoverDays}
                flavorPricing={flavorPricing}
                onPackagingChange={setSelectedPackagingId}
                onOpenSample={open}
              />
            )}
          />
        ) : (
          <ProductDetailConfigurator
            template={template}
            detail={detail}
            pricingRows={pricingRows}
            viewerTier={viewerTier}
            isAuthenticated={isAuthenticated}
            feePctByTier={feePctByTier}
            flavorMode={flavorMode}
            maxFlavorsPerPack={maxFlavorsPerPack}
            flavorPool={flavorPool}
            changeoverDays={changeoverDays}
            flavorPricing={flavorPricing}
            onPackagingChange={setSelectedPackagingId}
          />
        )}

        <BusinessPromoCard />
      </div>
    </section>
  )
}

/** ZONE 1 — vertical thumbnails + main image. Real images or emoji+gradient. */
function HeroGallery({
  template,
  images,
}: {
  template: SampleTemplate
  images: string[]
}) {
  const hasImages = images.length > 0
  const mainGradient = (template.gradient ?? 'mint') as ProductGradient
  const gradientThumbs: ProductGradient[] = ['lime', 'pink', 'cyan', 'yellow']
  const [activeIndex, setActiveIndex] = React.useState(0)

  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      <div className="flex gap-2.5">
        {/* Thumbnails */}
        <div className="flex flex-shrink-0 flex-col gap-2">
          {hasImages
            ? images.slice(0, 4).map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`View image ${i + 1}`}
                  className={
                    'h-14 w-14 overflow-hidden rounded-[10px] border transition-colors ' +
                    (i === activeIndex
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
          className="flex aspect-square flex-1 items-center justify-center overflow-hidden rounded-2xl border border-ink-200"
          style={hasImages ? undefined : { background: productGradient[mainGradient] }}
        >
          {hasImages ? (
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
