import type * as React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import {
  CertStrip,
  ProductSpecGrid,
  NutritionFactsRenderer,
  InciDeclarationSvg,
  GuaranteedAnalysisSvg,
} from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { ProductDetailHero } from '@/components/ProductDetailHero'
import { ProductTabs } from '@/components/ProductTabs'
import { ProductAccordion } from '@/components/ProductAccordion'
import { RecipeNutritionStudio } from '@/components/RecipeNutritionStudio'
import { ProductCarousel } from '@/components/ProductCarousel'
import { CATEGORY_ROWS, templateToCardProps, type SampleTemplate } from '@/lib/sample-templates'
import { RatingStars, RatingBreakdownPopover, Tooltip } from '@ilaunchify/ui'
import { getTemplateRatingAndReviews, type TemplateLiveRating } from '@/lib/template-reviews'
import { TemplateReviewsSection } from './TemplateReviewsSection'
import { getPrintProviderCards } from '@/lib/print-providers'
import { PrintProvidersSection } from './PrintProvidersSection'
import { getMyPrintSelection, isPrintLegNominated } from './select-provider-action'
import { getMarketplaceTemplateBySlug, getTemplateDetailOverrides, getTemplateGalleryImages } from '@/lib/templates'
import { getTemplateRecipeDetail, type DomainFacts } from '@/lib/recipe-detail'
import { getTemplateFlavorRecipes } from '@/lib/flavor-recipe-detail'
import { getTemplateFlavorDomainFacts } from '@/lib/flavor-domain-facts'
import { DomainFactsSwitcher } from '@/components/DomainFactsSwitcher'
import { findTemplateDetail } from '@/lib/template-detail'
import { getCreatorPricingMatrix, getCreatorFeePcts, getPackBuilderData } from '@/lib/pricing'
import { getMarketingSession } from '@/lib/session'
import { getFavoritedTemplateIds } from '@/app/marketplace/favorites-actions'
import { MarketplaceProductActions } from '@/components/MarketplaceProductActions'
import { getCreatorTier } from '@ilaunchify/auth'
import { getManufacturerIdentity, type ManufacturerIdentity } from '@/lib/partner-profile'
import { getProductCertBadges } from '@/lib/product-cert-badges'
import { getProductNutrientSource } from '@/lib/product-nutrient-source'
import { getProductRestrictions } from '@/lib/product-restrictions'
import { getProductSampleOptions, getOwnedSampleProductId } from '@/lib/product-sample-options'
import { getPackagingImageMap } from '@/lib/packaging-images-db'
import { getTemplatePackagingOptions } from '@/lib/container-offerings-db'
import { processLabel } from '@ilaunchify/types'

/**
 * /marketplace/[category]/[subcategory]/[slug] — ProductTemplate at detail size.
 *
 * Renders the full configuration surface per Pavel's PeaPrint-inspired brief:
 *   - 2-column hero: gallery + spec-grid + variant pickers + pricing
 *   - Cert strip across full width
 *   - Customization + Material/properties bento section
 *   - Tabs: Description · Recipe & Nutrition · Ingredients · Compliance · Packing
 *   - Related templates
 *
 * Server component overall — client interactivity (flavor/packaging/quantity
 * pickers, earnings calculator, ingredient swaps) lives inside the
 * <ProductDetailConfigurator> client component.
 */
export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; subcategory: string; slug: string }>
  searchParams: Promise<{ as?: string }>
}) {
  const { category, slug } = await params
  await searchParams
  // REBUILD R2 — real auth-aware reading. The marketing app now shares the
  // Auth.js cookie with apps/creator on localhost (browsers don't include
  // port in cookie scope) and verifies via the same AUTH_SECRET.
  const session = await getMarketingSession()
  const isAuthenticated = Boolean(session?.user)
  const headerUser = session?.user
    ? {
        name: session.user.name,
        email: session.user.email,
        // Tier + active-brand label are V1.5+ (require reading
        // CreatorProfile.subscriptionTier + the active brand row).
      }
    : null
  // BrandSwitcher takes {id, name, colorHex}. Marketing's version
  // doesn't fetch colors yet — colorless brand entries still let the
  // dropdown render.
  const headerBrands =
    session?.brands.map((b) => ({
      id: b.id,
      name: b.name,
      colorHex: '#FF2E63',
    })) ?? []
  const activeBrandId = session?.activeBrandId ?? ''

  // DB-driven resolution (falls back to the sample fixture when the DB is empty
  // or the slug isn't a published template). Replaces the old CATEGORY_ROWS-only
  // lookup so real published ProductTemplates render their detail page.
  const resolved = await getMarketplaceTemplateBySlug(category, slug)
  if (!resolved) notFound()
  const template = resolved.template
  const related = resolved.related
  const categoryTitle = resolved.categoryTitle

  // Favorites (docs/FAVORITES_MANAGEMENT.md §11) — is this template already
  // saved by the signed-in creator? Only DB-backed templates carry a real id;
  // fixtures can't be favorited.
  const initialSavedTemplate =
    template.templateId && isAuthenticated
      ? (await getFavoritedTemplateIds([template.templateId])).length > 0
      : false

  // Marketing copy: start from the per-slug fixture (neutral GENERIC_DETAIL for
  // unknown slugs), then merge any DB-authored copy on top (ProductTemplate.
  // marketingDetail + longDescription→about) so real templates carry their own.
  // Flavors are overridden from the DB flavor pool below.
  const baseDetail = { ...findTemplateDetail(template.slug), ...(await getTemplateDetailOverrides(template.slug)) }

  // Live manufacturer rating + verified creator reviews (fail-soft — fixture
  // templates render the legacy RatingRow, no reviews section).
  const { rating: liveRating, reviews } = await getTemplateRatingAndReviews(template.slug, session?.user?.id)

  // PS-2/PS-3 — print-provider cards, gated by effectivePrintSourcing (§2):
  // null for IN_HOUSE manufacturers and fixture templates.
  const printProviders = await getPrintProviderCards(template.slug)

  // PS-3 — the signed-in creator's pinned printer for this template (null for
  // guests / partners / no pick). Feeds the "Select this provider" buttons.
  const canSelectProvider = session?.user?.role === 'CREATOR'
  const myPrintSelectionId =
    printProviders && canSelectProvider ? await getMyPrintSelection(template.slug) : null
  // D7 — if the manufacturer nominated a print co-partner, the creator can't pick.
  const printLegNominated = printProviders ? await isPrintLegNominated(template.slug) : false

  // Recipe-derived ingredients + Nutrition Facts — computed from the template's
  // real recipe slots via the nutrition engine (FOOD domain). Overrides the
  // fixture when the template carries recipe data; otherwise leaves the fixture
  // (fixture-only demos + non-food domains render unchanged).
  const recipeDetail = await getTemplateRecipeDetail(template.slug)
  // Slice 4 — per-flavor recipes for the Recipe-tab flavor tabs (multi-flavor only).
  const flavorRecipes = await getTemplateFlavorRecipes(template.slug)
  // Per-flavor Supplement Facts / Guaranteed Analysis (multi-flavor supplement + pet).
  const flavorDomainFacts = await getTemplateFlavorDomainFacts(template.slug)
  // Real product images (hero first) for the gallery; [] → emoji+gradient fallback.
  const galleryImages = await getTemplateGalleryImages(template.slug)
  // A product is "recipe-backed" if the DB gave us real ingredients, a computed/
  // declared panel, OR a non-food domain declaration (cosmetic INCI / pet GA).
  // For those, the product OWNS its recipe data — we must NOT inherit the fixture's
  // generic FOOD ingredients/panel, which otherwise bleeds onto cosmetic/pet/
  // supplement products (e.g. a serum showing "Cocoa powder" + a Supplement Facts
  // panel). Fixture-only demo slugs (no DB recipe) keep the fixture as before.
  const hasRealRecipe =
    recipeDetail.ingredients.length > 0 || recipeDetail.nutrition != null || recipeDetail.domain != null
  const detail = {
    ...baseDetail,
    ...(hasRealRecipe
      ? {
          ingredients: recipeDetail.ingredients,
          ingredientAddOns: recipeDetail.addOns,
          nutrition: recipeDetail.nutrition ?? undefined,
        }
      : {}),
  }

  // #38 (2026-07-19) — the product's SCOPED packaging options (the manufacturer's
  // real container offerings + their decoration methods) for the PDP packaging
  // picker. Replaces the removed fixture packaging/size lists; the creator picks the
  // container here and its offering flows to launch. [] hides the picker.
  const packagingOptions = await getTemplatePackagingOptions(template.slug)

  // P3 — real creator price = manufacturer unit cost + tier-discounted platform
  // fee. Tier comes from the signed-in creator's CreatorProfile (Maker for
  // signed-out). Shipping is excluded (estimated at checkout).
  const viewerTier = session?.user?.id ? await getCreatorTier(session.user.id) : 'maker'

  // Named manufacturer line (Pavel 2026-07-12) — replaces the anonymous badge
  // when EVERY gate passes: admin PartnerProfileSetting tier gate + the
  // partner's own FULL disclosure + mfr/co-pack service + ACTIVE. Null keeps
  // the anonymous earned-badge line (orchestration-thesis default).
  const manufacturerIdentity = await getManufacturerIdentity(
    template.slug,
    viewerTier,
    isAuthenticated,
  )

  const pricingMatrix = await getCreatorPricingMatrix(template.slug, viewerTier)
  const pricingRows = pricingMatrix.rows
  // Per-tier fee % for the modal's Maker/Builder/Agency columns.
  const feePctByTier = await getCreatorFeePcts()

  // Variety-pack builder data — flavorMode + flavor pool + maxFlavorsPerPack +
  // changeover days. Drives the PackBuilder + live D5 lead-time in MULTI mode.
  const packData = await getPackBuilderData(template.slug)

  // Per-package hero image — one resolved URL per linked PackagingSystem
  // (override → PackagingType mockup base → partner image). Empty Map for
  // fixture-only / demo templates, so the attach below is a no-op then. Match by
  // packaging-option id ↔ PackagingSystem id; we only ATTACH imageUrl, never
  // touch ids / order / price / lead time / availability.
  const packagingImageMap = await getPackagingImageMap(template.slug)
  const packagingWithImages =
    packagingImageMap.size > 0
      ? detail.packaging.map((p) => {
          const url = packagingImageMap.get(p.id)
          return url ? { ...p, imageUrl: url } : p
        })
      : detail.packaging
  const detailWithPackaging =
    packagingWithImages === detail.packaging ? detail : { ...detail, packaging: packagingWithImages }

  // Override the fixture flavor list with the template's REAL flavor pool from the
  // DB when present (single-flavor swatch in SINGLE mode; PackBuilder uses the pool
  // directly in MULTI mode). Keeps the fixture flavors as fallback for fixture-only
  // demo templates with no DB flavor presets.
  const detailForConfigurator =
    packData.pool.length > 0
      ? { ...detailWithPackaging, flavors: packData.pool.map((f) => ({ id: f.id, name: f.name, color: f.swatchHex ?? '#E7E2D8' })) }
      : detailWithPackaging

  // Sample policy — enabled sample kinds the partner offers for this product
  // (Pavel 2026-06-10). Empty → the "Order a sample" card hides (fixture-only /
  // partner hasn't enabled samples).
  const sampleData = await getProductSampleOptions(template.slug)

  // Samples require an existing product (locked). Resolve whether the signed-in
  // creator already owns a Product for this template → enables the "Order a
  // sample" deep-link; otherwise the card guides them to customise first.
  const ownedSampleProductId =
    session?.user?.id && sampleData.options.length > 0
      ? await getOwnedSampleProductId(template.slug, session.user.id)
      : null

  // Cert strip. The authoritative signal is the product's EARNED certs —
  // VERIFIED PartnerCertificateInstances surfaced as admin-curated PNG badges
  // ("added by the vendor → approved by admin → live in the marketplace").
  // When the template has none yet (fixture-only / pre-launch), fall back to
  // the tag-derived certs so the strip still reads as a trust signal.
  const earnedCertBadges = await getProductCertBadges(template.slug)
  // Slice 4 — DECLARED products show the manufacturer-attestation disclosure.
  const nutrientSource = await getProductNutrientSource(template.slug)
  // Restricted-category eligibility (labeling ≠ licensing). Non-empty → a
  // "not available for production yet" notice so a creator never starts
  // designing a product they can't order.
  const restrictionLabels = await getProductRestrictions(template.slug)
  const certs =
    earnedCertBadges.length > 0
      ? earnedCertBadges.map((b) => ({
          name: b.name,
          iconUrl: b.iconUrl ?? undefined,
          // Fallback glyph keeps the badge circle filled if the PNG is missing.
          icon: certIconForLabel(b.name),
          unconditional: true,
        }))
      : // Per Pavel: only surface a qualifier line for organic certs. The
        // generic 'Independent verification' label was noise — let the cert
        // name speak for itself.
        (template.tags ?? []).map((tag) => ({
          name: tag.label,
          qualifier: tag.organic ? 'Certified Organic' : undefined,
          icon: certIconForLabel(tag.label),
          unconditional: tag.organic ?? false,
        }))

  // Identity-column accordion — fed from existing detail fields. First row open
  // by default (handled inside ProductAccordion). Rows render only when they
  // carry content, so a sparse fixture doesn't show empty sections.
  const ingredientStatement = detail.ingredients.map((i) => i.name).join(', ')
  const allergenList = allergensFromIngredients(detail.ingredients)
  const firstSpec = detail.packingSpecs[0]
  const accordionRows = [
    ingredientStatement && {
      id: 'ingredients',
      title: 'Ingredients',
      body: (
        <span>
          {ingredientStatement}.{' '}
          <span className="font-semibold text-pink-700">See full label in the Recipe tab.</span>
        </span>
      ),
    },
    {
      id: 'allergens',
      title: 'Allergens',
      body:
        allergenList.length > 0
          ? `Contains: ${allergenList.join(', ')}. Made in a facility that handles common allergens.`
          : 'No major (FALCPA Big-9) allergens in the base recipe. Final "Contains" statement is confirmed at the compliance check.',
    },
    firstSpec && {
      id: 'dimensions',
      title: 'Dimensions & weight',
      body: `Carton ${firstSpec.box} (${firstSpec.boxIn}) · gross ${firstSpec.weightG} g (${firstSpec.weightLb} lb) · volume ${firstSpec.volumeCm3} cm³.`,
    },
    {
      id: 'shelf-life',
      title: 'Shelf life & storage',
      body: shelfLifeFromProperties(detail.properties),
    },
    {
      id: 'shipping',
      title: 'Shipping & returns',
      body: `Produced to order, ~${template.leadTimeDays}-day lead. Made-to-order runs are non-returnable; defective units are remade or refunded.`,
    },
  ].filter(Boolean) as { id: string; title: string; body: React.ReactNode }[]

  return (
    <>
      <MarketplaceHeader
        user={headerUser}
        hasUnreadNotifications={false}
        brands={headerBrands}
        activeBrandId={activeBrandId}
      />

      <div className="max-w-[1640px] mx-auto px-8 py-6">
        <Breadcrumb category={category} categoryTitle={categoryTitle} title={template.title} />

        {/* Restricted-category notice (labeling ≠ licensing) — this product
            falls into a category iLaunchify doesn't support yet, so it can't be
            taken to production. Shown before the configurator so creators don't
            invest effort in something they can't order. */}
        {restrictionLabels.length > 0 && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-2xl border border-warning-300 bg-warning-50 px-5 py-4 text-warning-900"
          >
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-[13px] font-semibold">
                Not available for production yet — {restrictionLabels.join(', ')}
              </p>
              <p className="text-[12px] leading-relaxed text-warning-800">
                This category requires licensing or permitting iLaunchify
                doesn&rsquo;t support yet, so it can&rsquo;t be ordered. This is
                not legal advice.
              </p>
            </div>
          </div>
        )}

        {/* HERO — 3-zone: gallery (1.15fr) · identity (1fr) · zone3 (380px
            configure box + business card). Stacks to one column under ~1000px.
            ProductDetailHero is the client root; the identity column is
            server-rendered and passed through so taxonomy chips, the cert trust
            strip, the spec strip, and the accordion stay server-derived. */}
        <div className="mb-12">
          <ProductDetailHero
            template={template}
            detail={detailForConfigurator}
            images={galleryImages}
            pricingRows={pricingRows}
            viewerTier={viewerTier}
            isAuthenticated={isAuthenticated}
            feePctByTier={feePctByTier}
            platformFeeBps={pricingMatrix.feeBps}
            platformFeeBounds={pricingMatrix.feeBounds}
            flavorMode={packData.flavorMode}
            maxFlavorsPerPack={packData.maxFlavorsPerPack}
            flavorPool={packData.pool}
            changeoverDays={packData.changeoverDays}
            standardLead={packData.standardLead}
            flavorPricing={packData.flavorPricing}
            packSizes={packData.packSizes}
            packagingOptions={packagingOptions}
            minFlavors={packData.minFlavors}
            fillRule={packData.fillRule}
            pricingBasis={packData.pricingBasis}
            flavorUnitPriceCents={packData.flavorUnitPriceCents}
            structuralType={packData.structuralType}
            flavorPolicy={packData.flavorPolicy}
            assortment={packData.assortment}
            fixedDistribution={packData.fixedDistribution}
            sample={
              sampleData.options.length > 0
                ? {
                    options: sampleData.options,
                    flavorNames: sampleData.flavorNames,
                    isMultiFlavor: sampleData.isMultiFlavor,
                    dielineReady: sampleData.dielineReady,
                    ownedProductId: ownedSampleProductId,
                  }
                : null
            }
            identity={
              <IdentityColumn
                template={template}
                templateId={template.templateId}
                initialSaved={initialSavedTemplate}
                detail={detail}
                certs={certs}
                accordionRows={accordionRows}
                liveRating={liveRating}
                manufacturerIdentity={manufacturerIdentity}
                hasReviews={reviews.length > 0}
                starBuckets={
                  reviews.length > 0
                    ? [5, 4, 3, 2, 1].map((s) => ({ star: s, n: reviews.filter((r) => r.rating === s).length }))
                    : undefined
                }
              />
            }
            belowFold={
              <div className="mt-2">
                <ProductTabs
                  overview={<OverviewTab template={template} detail={detail} />}
                  recipe={
                    <RecipeTab
                      template={template}
                      detail={detail}
                      nutrientSource={nutrientSource}
                      domain={recipeDetail.domain}
                      recipeDetail={recipeDetail}
                      hasRealRecipe={hasRealRecipe}
                      flavors={flavorRecipes}
                      flavorDomainFacts={flavorDomainFacts}
                    />
                  }
                  packaging={<PackingTab detail={detail} />}
                  compliance={<ComplianceTab detail={detail} certs={certs} />}
                />
              </div>
            }
          />
        </div>
      </div>

      {/* TABS moved INTO the hero's left column (below gallery+identity) via the
          ProductDetailHero `belowFold` slot, so the tall sticky configure rail
          stays visible beside them while scrolling. */}

      {/* PRINT PROVIDERS (docs/PRINT_PROVIDER_SELECTION.md §3 + §4) — only
          when the manufacturer's labelingMode allows external print. */}
      {printProviders && (
        <PrintProvidersSection
          view={printProviders}
          templateSlug={template.slug}
          initialSelectedServiceId={myPrintSelectionId}
          canSelect={canSelectProvider}
          nominated={printLegNominated}
        />
      )}

      {/* CREATOR REVIEWS (docs/FEEDBACK_MODULE.md §6.2) — verified-only,
          anchored for the stars popover's "See Creator Reviews" link. */}
      <TemplateReviewsSection reviews={reviews} />

      {/* RELATED */}
      {related.length > 0 && (
        <section className="max-w-[1640px] mx-auto px-8 mb-24">
          <h2 className="font-display text-ui-display mb-7">
            You might also like
          </h2>
          <ProductCarousel items={related.map(templateToCardProps)} />
        </section>
      )}
    </>
  )
}

/* ============ subcomponents (server-rendered, page-scoped) ============ */

function Breadcrumb({
  category,
  categoryTitle,
  title,
}: {
  category: string
  categoryTitle: string
  title: string
}) {
  return (
    // No Home crumb — Marketplace is the root for this funnel.
    <div className="text-[13px] text-ink-500 mb-4">
      <Link href="/marketplace" className="hover:text-ink-900">
        Marketplace
      </Link>{' '}
      ›{' '}
      <Link href={`/marketplace/${category}`} className="hover:text-ink-900">
        {categoryTitle}
      </Link>{' '}
      › <span>{title}</span>
    </div>
  )
}

/* Rating + social-proof row — ★★★★★ 4.8 · N launches (prototype). Pink stars
   on-brand; renders the real ratingAvg when present, otherwise a quiet "New".
   `launches` is the ratingCount today (closest existing metric) — swap for a
   dedicated launch count when one lands. Server component, no interactivity. */
function RatingRow({ ratingAvg, launches }: { ratingAvg?: number | null; launches: number }) {
  if (ratingAvg == null && launches <= 0) return null
  const filled = ratingAvg != null ? Math.round(ratingAvg) : 0
  return (
    <div className="mb-3 flex items-center gap-2 text-[13px] text-ink-500">
      {ratingAvg != null ? (
        <>
          <span className="inline-flex text-[14px] leading-none" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={i < filled ? 'text-pink-600' : 'text-ink-200'}>
                ★
              </span>
            ))}
          </span>
          <span className="font-semibold tabular-nums text-ink-800">{ratingAvg.toFixed(1)}</span>
          {launches > 0 && <span>· {launches.toLocaleString()} launches</span>}
        </>
      ) : (
        <span>New · {launches.toLocaleString()} launches</span>
      )}
    </div>
  )
}

/* Earned manufacturer standing under the rating (docs/PARTNER_TIER_VS_MERIT.md
   perk model). Renders in both rating branches.

   Default: ANONYMOUS badge only — never the partner's name/location/link
   (orchestration thesis). NAMED variant (Pavel 2026-07-12): when `identity` is
   resolved (admin PartnerProfileSetting tier gate + partner FULL disclosure +
   mfr/co-pack service all passed), the line becomes
   "Manufacturer: {name} [badge]" with the name linking to the public Front
   Face profile when one is published. Hidden for Verified-anonymous /
   no-manufacturer. */
function ManufacturerBadgeLine({
  badge,
  identity,
}: {
  badge?: 'TRUSTED' | 'PREMIER' | null
  identity?: ManufacturerIdentity | null
}) {
  const effectiveBadge = identity?.badge ?? badge
  if (!identity && !effectiveBadge) return null
  const isPremier = effectiveBadge === 'PREMIER'
  const tip = isPremier
    ? "Premier — iLaunchify's top manufacturer standing. Earned for sustained excellence across production quality, reliability, and order volume."
    : 'Trusted — an earned manufacturer standing on iLaunchify, for proven order volume and consistently high production quality.'
  return (
    <div className="mb-3 -mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-500">
      <span>Manufacturer:</span>
      {identity &&
        (identity.href ? (
          <Link
            href={identity.href}
            className="font-semibold text-ink-900 underline decoration-pink-300 underline-offset-2 transition-colors hover:text-pink-700"
          >
            {identity.name}
          </Link>
        ) : (
          <span className="font-semibold text-ink-900">{identity.name}</span>
        ))}
      {effectiveBadge && (
        <Tooltip content={tip}>
          <span
            className={
              'inline-flex cursor-help items-center rounded-full border px-2 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide ' +
              (isPremier
                ? 'border-pink-200 bg-pink-50 text-pink-800'
                : 'border-info-200 bg-info-50 text-info-800')
            }
          >
            {isPremier ? 'Premier' : 'Trusted'}
          </span>
        </Tooltip>
      )}
    </div>
  )
}

/* ZONE 2 — identity column. Server-rendered; passed into ProductDetailHero.
   Eyebrow · title · rating · CERT TRUST STRIP (moved here from the gallery) ·
   taxonomy chips · about blurb · key-facts strip (ProductSpecGrid data) ·
   accordion. */
function IdentityColumn({
  template,
  templateId,
  initialSaved,
  detail,
  certs,
  accordionRows,
  liveRating,
  manufacturerIdentity,
  hasReviews,
  starBuckets,
}: {
  template: SampleTemplate
  templateId?: string
  initialSaved?: boolean
  detail: ReturnType<typeof findTemplateDetail>
  certs: Array<{
    name: string
    qualifier?: string
    icon?: string
    iconUrl?: string
    unconditional?: boolean
  }>
  accordionRows: { id: string; title: string; body: React.ReactNode }[]
  liveRating: TemplateLiveRating | null
  manufacturerIdentity?: ManufacturerIdentity | null
  hasReviews: boolean
  starBuckets?: { star: number; n: number }[]
}) {
  return (
    <>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
        {template.niche}
      </div>
      <h1 className="mb-2 font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-900">
        {template.title}
      </h1>

      {/* Save + Share cluster — beside the title, never on the hero image
          (docs/FAVORITES_MANAGEMENT.md §11). */}
      <MarketplaceProductActions
        templateId={templateId}
        initialSaved={initialSaved}
        shareTitle={template.title}
      />

      {/* Rating + social proof (docs/FEEDBACK_MODULE.md §5.4): live manufacturer
          rating (Bayesian-backed aggregate) with the Amazon-style dimension
          popover + "See Creator Reviews" anchor when real ratings exist;
          otherwise the legacy fixture row ("New" when unrated). */}
      {liveRating ? (
        <div className="mb-3">
          <RatingStars mean={liveRating.mean} count={liveRating.count} isNew={liveRating.isNew}>
            {!liveRating.isNew && (
              <RatingBreakdownPopover
                mean={liveRating.mean}
                count={liveRating.count}
                dims={liveRating.dims}
                starBuckets={hasReviews ? starBuckets : undefined}
                reviewsHref={hasReviews ? '#creator-reviews' : undefined}
              />
            )}
          </RatingStars>
        </div>
      ) : (
        <RatingRow ratingAvg={template.ratingAvg} launches={template.ratingCount ?? 0} />
      )}

      {/* Manufacturer line — named + linked when the visibility gates pass
          (admin tier switch + partner FULL disclosure); anonymous earned badge
          otherwise. */}
      <ManufacturerBadgeLine badge={template.manufacturerBadge} identity={manufacturerIdentity} />

      {/* Key-facts card — DIRECTLY under the title. Format · MOQ · Lead ·
          Process (the manufacturer's production method). Process reads real
          ProductTemplate.manufacturingProcesses; shows "--" when none is set. */}
      <ProductSpecGrid
        items={[
          { label: 'Format', value: detail.format },
          { label: 'MOQ', value: template.minUnits.toLocaleString() },
          { label: 'Lead', value: `${template.leadTimeDays}d` },
          {
            label: 'Process',
            value: template.processSlugs?.[0] ? processLabel(template.processSlugs[0]) : '--',
          },
        ]}
        className="mb-3.5 overflow-hidden rounded-[var(--card-radius)]"
      />

      {/* Cert badges — below the facts. Just the badges (the "Verified &
          certified" eyebrow that sat above them is removed). */}
      {certs.length > 0 && (
        <div className="mb-3.5 border-y border-ink-100 py-2.5">
          <CertStrip items={certs} heading="" compact />
        </div>
      )}

      {/* Short description. */}
      <p className="mb-4 max-w-[54ch] text-[14px] leading-relaxed text-ink-700">
        {detail.about}
      </p>

      {/* Accordion — additional info from existing detail fields. */}
      <ProductAccordion rows={accordionRows} />
    </>
  )
}

/* Overview tab (default) — restores the product's About copy + the "About this
   item" attributes that were dropped in the PDP rebuild. Left column = the
   long-form description + the performance/spec bullets; right column = a
   key-attributes table reusing existing detail fields (no invented data). */
function OverviewTab({
  template,
  detail,
}: {
  template: SampleTemplate
  detail: ReturnType<typeof findTemplateDetail>
}) {
  const shelfLife = detail.properties.find((p) => /shelf life/i.test(p.label))?.label
  const servings = detail.sizeChart[0]?.servings
  const attributes = [
    detail.format && { label: 'Format', value: detail.format },
    detail.netWeight && { label: 'Net weight', value: detail.netWeight },
    detail.productionMethod && { label: 'Production method', value: detail.productionMethod },
    servings && { label: 'Servings', value: servings },
    shelfLife && { label: 'Shelf life', value: shelfLife.replace(/^Shelf life\s*\(?|\)?$/gi, '') },
    { label: 'Min. order', value: `${template.minUnits.toLocaleString()} units` },
    { label: 'Lead time', value: `${template.leadTimeDays} days` },
    { label: 'From', value: `$${template.pricePerUnit.toFixed(2)} / unit` },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px] lg:items-start">
      <div>
        <h3 className="mb-4 font-display text-ui-title">About this product</h3>
        <p className="mb-7 max-w-[68ch] text-[15px] leading-relaxed text-ink-700">
          {detail.about}
        </p>

        {detail.performanceBullets.length > 0 && (
          <>
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.06em] text-ink-700">
              About this item
            </div>
            <ul className="space-y-2.5">
              {detail.performanceBullets.map((b) => {
                const [lead, ...rest] = b.split(/:\s*/)
                const body = rest.join(': ')
                return (
                  <li
                    key={b}
                    className="flex gap-2.5 text-[14px] leading-relaxed text-ink-700"
                  >
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-pink-500" />
                    <span>
                      {body ? (
                        <>
                          <span className="font-semibold text-ink-900">{lead}:</span> {body}
                        </>
                      ) : (
                        b
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      {/* Key attributes — reuse existing detail fields. */}
      <div className="lg:justify-self-end">
        <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.07em] text-ink-700">
          Key attributes
        </div>
        <dl className="overflow-hidden rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)]">
          {attributes.map((a, i) => (
            <div
              key={a.label}
              className={
                'flex items-baseline justify-between gap-4 px-4 py-3 text-[13px] ' +
                (i === 0 ? '' : 'border-t border-ink-100')
              }
            >
              <dt className="text-ink-500">{a.label}</dt>
              <dd className="text-right font-semibold text-ink-900">{a.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

/* Recipe & nutrition tab — combines the RecipeNutritionTab info (about recipe /
   declared-or-domain panel) with the interactive CustomizeRail (ingredient
   swaps + add-ons + live "Contains" + live Nutrition Facts + Preview-full-label)
   and the IngredientsTabInner swap UI. Two-column where the data supports it. */
function RecipeTab({
  template,
  detail,
  nutrientSource,
  domain,
  recipeDetail,
  hasRealRecipe,
  flavors,
  flavorDomainFacts,
}: {
  template: SampleTemplate
  detail: ReturnType<typeof findTemplateDetail>
  nutrientSource: 'COMPUTED' | 'DECLARED' | null
  domain?: DomainFacts
  recipeDetail: Awaited<ReturnType<typeof getTemplateRecipeDetail>>
  hasRealRecipe: boolean
  flavors: Awaited<ReturnType<typeof getTemplateFlavorRecipes>>
  flavorDomainFacts: Awaited<ReturnType<typeof getTemplateFlavorDomainFacts>>
}) {
  // Cosmetic / pet declaration (or a DB product with no swappable food slots) —
  // there's nothing to customize, so show the declaration block only.
  if (domain || (hasRealRecipe && detail.ingredients.length === 0)) {
    return (
      <RecipeNutritionTab detail={detail} nutrientSource={nutrientSource} domain={domain} flavorDomainFacts={flavorDomainFacts} />
    )
  }

  // Food / supplement with a swappable recipe — the 3-column "recipe studio":
  //   LEFT   recipe (swaps) + optional ingredients
  //   MIDDLE live regulated Facts label (focal) + "Preview full label" modal
  //   RIGHT  recipe summary · live ingredient statement · live "Contains" · net wt
  // One shared live state drives all three columns (the recompute logic lifted
  // verbatim from CustomizeRail — recomputeMarketplacePanel on each swap/add-on).
  return (
    <RecipeNutritionStudio
      slug={template.slug}
      about={detail.about}
      ingredients={detail.ingredients}
      ingredientAddOns={detail.ingredientAddOns}
      nutrition={detail.nutrition}
      netWeight={detail.netWeight}
      servings={detail.sizeChart[0]?.servings}
      flavors={flavors}
    />
  )
}

function RecipeNutritionTab({
  detail,
  nutrientSource,
  domain,
  flavorDomainFacts = [],
}: {
  detail: ReturnType<typeof findTemplateDetail>
  nutrientSource: 'COMPUTED' | 'DECLARED' | null
  /** Cosmetic INCI / pet Guaranteed Analysis — when present, the domain block
   *  replaces the (food/supplement) nutrition panel on the right. */
  domain?: DomainFacts
  /** Per-flavor supplement/pet panels — when non-empty, the right rail shows a
   *  Base + flavor switcher instead of the single base panel. */
  flavorDomainFacts?: Awaited<ReturnType<typeof getTemplateFlavorDomainFacts>>
}) {
  const declared = nutrientSource === 'DECLARED'
  const petFlavors = flavorDomainFacts.filter((f) => f.domain?.kind === 'PET')
  const supplementFlavors = flavorDomainFacts.filter((f) => f.nutrition != null)
  // A real domain declaration (cosmetic/pet) takes precedence over any fixture
  // nutrition panel — a cosmetic must never show a food/supplement panel.
  if (domain) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12 items-start">
        <div>
          <h3 className="font-display text-ui-title mb-4">
            About this product
          </h3>
          <p className="text-[15px] text-ink-700 leading-relaxed mb-6">{detail.about}</p>
          {domain.kind === 'COSMETIC' && (
            <div className="text-[13px] text-ink-600 leading-relaxed">
              Full ingredient declaration follows INCI naming per 21 CFR 701.3.
            </div>
          )}
        </div>
        <div className="lg:justify-self-end">
          {domain.kind === 'PET' && petFlavors.length > 0 ? (
            // Multi-flavor pet food — Base + per-flavor GA switcher.
            <DomainFactsSwitcher kind="PET" baseDomain={domain} flavors={petFlavors} widthPx={340} />
          ) : (
            <>
              <div className="text-[12px] font-bold uppercase tracking-[0.07em] text-ink-700 mb-3">
                {domain.kind === 'COSMETIC' ? 'INCI declaration' : 'Guaranteed Analysis'}
              </div>
              {domain.kind === 'COSMETIC' ? (
                <InciDeclarationSvg
                  ingredients={domain.ingredients}
                  netContents={domain.netContents}
                  responsiblePerson={domain.responsiblePerson}
                  adverseEventContact={domain.adverseEventContact}
                  widthPx={340}
                />
              ) : (
                <GuaranteedAnalysisSvg
                  gaRows={domain.gaRows}
                  ingredients={domain.ingredients}
                  adequacyStatement={domain.adequacyStatement}
                  feedingDirections={domain.feedingDirections}
                  widthPx={340}
                />
              )}
              <div className="text-[11px] text-ink-500 mt-2 max-w-[340px]">
                Computed from the manufacturer&rsquo;s formulation. Final label is
                re-validated by the compliance service before production.
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 items-start">
      <div>
        <h3 className="font-display text-ui-title mb-4">
          About this recipe
        </h3>
        <p className="text-[15px] text-ink-700 leading-relaxed mb-6">
          {detail.about}
        </p>
        <div className="text-[13px] text-ink-700 mb-2 uppercase tracking-[0.06em] font-bold">
          Allergens to be aware of
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allergensFromIngredients(detail.ingredients).map((a) => (
            <span
              key={a}
              className="text-[11px] font-semibold text-warning-500 bg-warning-50 px-2 py-0.5 rounded-pill"
            >
              {a}
            </span>
          ))}
        </div>
      </div>

      {(detail.nutrition || declared) && (
        <div className="lg:justify-self-end">
          {declared && (
            <div className="mb-3 max-w-[300px] rounded-md border border-pink-200 bg-pink-50/60 p-3 text-[12px] leading-snug text-ink-700">
              <strong className="font-semibold text-ink-900">
                Nutrition facts entered by the manufacturer.
              </strong>{' '}
              iLaunchify did not compute these values from individual ingredients.
              The manufacturer attests to their accuracy.
            </div>
          )}
          {detail.nutrition && supplementFlavors.length > 0 ? (
            // Multi-flavor supplement — Base + per-flavor Supplement Facts switcher.
            <DomainFactsSwitcher kind="SUPPLEMENT" baseNutrition={detail.nutrition} declared={declared} flavors={supplementFlavors} widthPx={300} />
          ) : detail.nutrition ? (
            <>
              <div className="text-[12px] font-bold uppercase tracking-[0.07em] text-ink-700 mb-3">
                Supplement Facts (base recipe)
              </div>
              <NutritionFactsRenderer
                data={detail.nutrition}
                widthPx={300}
                declaredByManufacturer={declared}
              />
              <div className="text-[11px] text-ink-500 mt-2 max-w-[300px]">
                {declared
                  ? 'Declared by the manufacturer. Not computed by iLaunchify.'
                  : 'Renders per FDA 21 CFR 101.36. Live-updates when the creator adjusts the recipe.'}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

function ComplianceTab({
  detail,
  certs,
}: {
  detail: ReturnType<typeof findTemplateDetail>
  certs: Array<{
    name: string
    qualifier?: string
    icon?: string
    iconUrl?: string
    unconditional?: boolean
  }>
}) {
  return (
    <div className="space-y-10">
      {/* Full certificate detail — names + status from the earned/tag-derived
          cert badges. */}
      {certs.length > 0 && (
        <div>
          <h3 className="mb-4 font-display text-ui-title">Certificates</h3>
          <CertStrip
            items={certs}
            heading="This product can be produced with the following certifications"
            compact
            className="rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] p-5"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 font-display text-ui-title">Reminder</h3>
          <p className="text-[15px] leading-relaxed text-ink-700">{detail.designReminder}</p>
        </div>
        <div>
          <h3 className="mb-4 font-display text-ui-title">Picture request</h3>
          <p className="mb-6 text-[15px] text-ink-700">{detail.pictureRequest}</p>
          <h3 className="mb-4 font-display text-ui-title">Design area</h3>
          <p className="text-[15px] text-ink-700">
            Front-label print. Full bleed at the trim line. 3 mm safety margin enforced by the
            canvas die-cut frame.
          </p>
        </div>
      </div>
    </div>
  )
}

function PackingTab({ detail }: { detail: ReturnType<typeof findTemplateDetail> }) {
  return (
    <div>
      <h3 className="font-display text-ui-title mb-5">
        Packing specifications
      </h3>
      <div className="border border-[var(--card-border)] rounded-[var(--card-radius)] overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Size</th>
              <th className="text-left px-4 py-3 font-semibold">Box (cm)</th>
              <th className="text-left px-4 py-3 font-semibold">Box (in)</th>
              <th className="text-right px-4 py-3 font-semibold">Volume (cm³)</th>
              <th className="text-right px-4 py-3 font-semibold">Volume (in³)</th>
              <th className="text-right px-4 py-3 font-semibold">Gross (g)</th>
              <th className="text-right px-4 py-3 font-semibold">Gross (lb)</th>
            </tr>
          </thead>
          <tbody>
            {detail.packingSpecs.map((s, i) => (
              <tr key={s.size} className={i % 2 === 0 ? 'bg-[var(--bg-surface)]' : 'bg-ink-50/40'}>
                <td className="px-4 py-3 text-ink-900 font-medium">{s.size}</td>
                <td className="px-4 py-3 text-ink-700">{s.box}</td>
                <td className="px-4 py-3 text-ink-700">{s.boxIn}</td>
                <td className="px-4 py-3 text-right text-ink-700 tabular-nums">
                  {s.volumeCm3}
                </td>
                <td className="px-4 py-3 text-right text-ink-700 tabular-nums">
                  {s.volumeIn3}
                </td>
                <td className="px-4 py-3 text-right text-ink-700 tabular-nums">{s.weightG}</td>
                <td className="px-4 py-3 text-right text-ink-700 tabular-nums">
                  {s.weightLb}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ============ helpers ============ */

function allergensFromIngredients(
  ingredients: ReturnType<typeof findTemplateDetail>['ingredients'],
): string[] {
  const set = new Set<string>()
  for (const ing of ingredients) for (const a of ing.allergens ?? []) set.add(a)
  return Array.from(set)
}

/** Derive a shelf-life / storage line from the detail properties (the fixture
 *  encodes shelf life as a "Shelf life (N months)" property bar). Falls back to
 *  a generic shelf-stable line when no shelf-life property is present. */
function shelfLifeFromProperties(
  properties: ReturnType<typeof findTemplateDetail>['properties'],
): string {
  const shelf = properties.find((p) => /shelf life/i.test(p.label))
  if (shelf) {
    return `${shelf.label}. Store cool and dry; shelf-stable, no refrigeration required.`
  }
  return 'Shelf-stable. Store cool and dry; no refrigeration required.'
}

function certIconForLabel(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('organic')) return '🌱'
  if (l.includes('vegan')) return '🌿'
  if (l.includes('non-gmo')) return '✓'
  if (l.includes('fair trade')) return '⚖️'
  if (l.includes('nsf')) return '🛡️'
  if (l.includes('cgmp')) return '🏭'
  if (l.includes('gluten')) return '🌾'
  if (l.includes('keto')) return '🥑'
  if (l.includes('sugar')) return '⚪'
  if (l.includes('paleo')) return '🍖'
  if (l.includes('caffeine')) return '☕'
  return '✓'
}

export async function generateStaticParams() {
  return CATEGORY_ROWS.flatMap((row) =>
    row.templates.map((t) => ({
      category: row.slug,
      subcategory: t.subcategorySlug ?? 'all',
      slug: t.slug,
    })),
  )
}
