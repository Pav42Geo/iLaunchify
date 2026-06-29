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
import { IngredientsTabInner } from '@/components/IngredientsTabInner'
import { CustomizeRail } from '@/components/CustomizeRail'
import { ProductCarousel } from '@/components/ProductCarousel'
import { CATEGORY_ROWS, templateToCardProps, type SampleTemplate } from '@/lib/sample-templates'
import { getMarketplaceTemplateBySlug, getTemplateDetailOverrides, getTemplateGalleryImages } from '@/lib/templates'
import { getTemplateRecipeDetail, type DomainFacts } from '@/lib/recipe-detail'
import { findTemplateDetail } from '@/lib/template-detail'
import { getCreatorPricingMatrix, getCreatorFeePcts, getPackBuilderData } from '@/lib/pricing'
import { getMarketingSession } from '@/lib/session'
import { getCreatorTier } from '@ilaunchify/auth'
import { getProductTaxonomyChips } from '@/lib/product-taxonomy-db'
import { getProductCertBadges } from '@/lib/product-cert-badges'
import { getProductNutrientSource } from '@/lib/product-nutrient-source'
import { getProductRestrictions } from '@/lib/product-restrictions'
import { getProductSampleOptions, getOwnedSampleProductId } from '@/lib/product-sample-options'

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

  // Marketing copy: start from the per-slug fixture (neutral GENERIC_DETAIL for
  // unknown slugs), then merge any DB-authored copy on top (ProductTemplate.
  // marketingDetail + longDescription→about) so real templates carry their own.
  // Flavors are overridden from the DB flavor pool below.
  const baseDetail = { ...findTemplateDetail(template.slug), ...(await getTemplateDetailOverrides(template.slug)) }

  // Recipe-derived ingredients + Nutrition Facts — computed from the template's
  // real recipe slots via the nutrition engine (FOOD domain). Overrides the
  // fixture when the template carries recipe data; otherwise leaves the fixture
  // (fixture-only demos + non-food domains render unchanged).
  const recipeDetail = await getTemplateRecipeDetail(template.slug)
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

  // Slice 2B — niche + lifestyle-tag chips below the title. Joins through
  // ProductTemplateNiche + ProductTemplateLifestyleTag. Empty arrays when
  // the template isn't in the DB yet → chip strips just don't render.
  const taxonomyChips = await getProductTaxonomyChips(template.slug)

  // PDP redesign — decoration moved to the Design Studio. The marketplace PDP
  // no longer surfaces a decoration picker (getDecorationOfferings dropped here).

  // P3 — real creator price = manufacturer unit cost + tier-discounted platform
  // fee. Tier comes from the signed-in creator's CreatorProfile (Maker for
  // signed-out). Shipping is excluded (estimated at checkout).
  const viewerTier = session?.user?.id ? await getCreatorTier(session.user.id) : 'maker'
  const pricingMatrix = await getCreatorPricingMatrix(
    template.slug,
    viewerTier,
    template.pricePerUnit,
  )
  const pricingRows = pricingMatrix.rows
  // Per-tier fee % for the modal's Maker/Builder/Agency columns.
  const feePctByTier = await getCreatorFeePcts()

  // Variety-pack builder data — flavorMode + flavor pool + maxFlavorsPerPack +
  // changeover days. Drives the PackBuilder + live D5 lead-time in MULTI mode.
  const packData = await getPackBuilderData(template.slug)

  // Override the fixture flavor list with the template's REAL flavor pool from the
  // DB when present (single-flavor swatch in SINGLE mode; PackBuilder uses the pool
  // directly in MULTI mode). Keeps the fixture flavors as fallback for fixture-only
  // demo templates with no DB flavor presets.
  const detailForConfigurator =
    packData.pool.length > 0
      ? { ...detail, flavors: packData.pool.map((f) => ({ id: f.id, name: f.name, color: f.swatchHex ?? '#E7E2D8' })) }
      : detail

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

      <div className="max-w-[1400px] mx-auto px-6 py-6">
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

        {/* HERO — 3-zone: gallery (1.15fr) · identity (1fr) · zone3 (340px
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
            flavorMode={packData.flavorMode}
            maxFlavorsPerPack={packData.maxFlavorsPerPack}
            flavorPool={packData.pool}
            changeoverDays={packData.changeoverDays}
            flavorPricing={packData.flavorPricing}
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
                detail={detail}
                taxonomyChips={taxonomyChips}
                certs={certs}
                accordionRows={accordionRows}
              />
            }
          />
        </div>
      </div>

      {/* TABS — Recipe & nutrition · Packaging · Compliance & certificates.
          The Recipe tab combines RecipeNutritionTab + the CustomizeRail (swaps,
          add-ons, live "Contains", live Nutrition Facts) + the ingredients-tab
          interactivity. Overview/Description dropped (now in the identity
          column). */}
      <section className="max-w-[1400px] mx-auto px-6 mb-20">
        <ProductTabs
          recipe={
            <RecipeTab
              template={template}
              detail={detail}
              nutrientSource={nutrientSource}
              domain={recipeDetail.domain}
              recipeDetail={recipeDetail}
              hasRealRecipe={hasRealRecipe}
            />
          }
          packaging={<PackingTab detail={detail} />}
          compliance={<ComplianceTab detail={detail} certs={certs} />}
        />
      </section>

      {/* RELATED */}
      {related.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-6 mb-24">
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

/* ZONE 2 — identity column. Server-rendered; passed into ProductDetailHero.
   Eyebrow · title · rating · CERT TRUST STRIP (moved here from the gallery) ·
   taxonomy chips · about blurb · key-facts strip (ProductSpecGrid data) ·
   accordion. */
function IdentityColumn({
  template,
  detail,
  taxonomyChips,
  certs,
  accordionRows,
}: {
  template: SampleTemplate
  detail: ReturnType<typeof findTemplateDetail>
  taxonomyChips: Awaited<ReturnType<typeof getProductTaxonomyChips>>
  certs: Array<{
    name: string
    qualifier?: string
    icon?: string
    iconUrl?: string
    unconditional?: boolean
  }>
  accordionRows: { id: string; title: string; body: React.ReactNode }[]
}) {
  return (
    <>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
        {template.niche}
      </div>
      <h1 className="mb-2 font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-900">
        {template.title}
      </h1>
      <div className="mb-3 flex items-center gap-2 text-[13px] text-ink-500">
        <RatingStars avg={template.ratingAvg} count={template.ratingCount} />
        <span className="text-ink-300">·</span>
        <span>{template.leadTimeDays}-day lead</span>
      </div>

      {/* Cert trust strip — moved here from the gallery. "Verified & certified"
          eyebrow + a horizontal row of the earned/tag-derived cert badges. */}
      {certs.length > 0 && (
        <div className="mb-3.5 border-y border-ink-100 py-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-success-700">
            <span aria-hidden="true">✓</span> Verified &amp; certified
          </div>
          <CertStrip items={certs} heading="" compact />
        </div>
      )}

      {/* Taxonomy chips — niche + lifestyle tags. */}
      {(taxonomyChips.niches.length > 0 || taxonomyChips.lifestyleTags.length > 0) && (
        <div className="mb-3.5 flex flex-col gap-2">
          {taxonomyChips.niches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {taxonomyChips.niches.map((n) => (
                <Link
                  key={n.slug}
                  href={`/launch/${n.slug}`}
                  className="inline-flex items-center gap-1 rounded-pill border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:border-pink-500 hover:text-pink-700 transition-colors"
                >
                  {n.iconEmoji && <span aria-hidden="true">{n.iconEmoji}</span>}
                  {n.name}
                </Link>
              ))}
            </div>
          )}
          {taxonomyChips.lifestyleTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {taxonomyChips.lifestyleTags.map((t) => (
                <Link
                  key={t.slug}
                  href={`/marketplace?tag=${encodeURIComponent(t.slug)}`}
                  className="inline-flex items-center gap-1 rounded-pill border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-600 hover:border-pink-500 hover:bg-white hover:text-pink-700 transition-colors"
                >
                  {t.iconEmoji && <span aria-hidden="true">{t.iconEmoji}</span>}
                  {t.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Short description. */}
      <p className="mb-4 max-w-[54ch] text-[14px] leading-relaxed text-ink-700">
        {detail.about}
      </p>

      {/* Key-facts strip — Format · MOQ · Lead · From. Reuses the spec-grid data. */}
      <ProductSpecGrid
        items={[
          { label: 'Format', value: detail.format },
          { label: 'MOQ', value: template.minUnits.toLocaleString() },
          { label: 'Lead', value: `${template.leadTimeDays}d` },
          { label: 'From', value: `$${template.pricePerUnit.toFixed(2)}` },
        ]}
        className="overflow-hidden rounded-xl"
      />

      {/* Accordion — additional info from existing detail fields. */}
      <ProductAccordion rows={accordionRows} />
    </>
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
}: {
  template: SampleTemplate
  detail: ReturnType<typeof findTemplateDetail>
  nutrientSource: 'COMPUTED' | 'DECLARED' | null
  domain?: DomainFacts
  recipeDetail: Awaited<ReturnType<typeof getTemplateRecipeDetail>>
  hasRealRecipe: boolean
}) {
  // Cosmetic / pet declaration (or a DB product with no swappable food slots) —
  // there's nothing to customize, so show the declaration block only.
  if (domain || (hasRealRecipe && detail.ingredients.length === 0)) {
    return (
      <RecipeNutritionTab detail={detail} nutrientSource={nutrientSource} domain={domain} />
    )
  }

  // Food / supplement with a swappable recipe — two columns: the swaps + add-ons
  // (IngredientsTabInner) on the left, the live "Contains" + Nutrition Facts
  // (CustomizeRail) on the right. CustomizeRail recomputes the panel server-side
  // on each swap; "Preview full label" opens the panel in a modal.
  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 font-display text-ui-title">About this recipe</h3>
        <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          {detail.about}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <IngredientsTabInner
          slug={template.slug}
          ingredients={recipeDetail.ingredients.length > 0 ? recipeDetail.ingredients : undefined}
          addOns={recipeDetail.addOns.length > 0 ? recipeDetail.addOns : undefined}
        />
        <CustomizeRail
          slug={template.slug}
          ingredients={detail.ingredients}
          ingredientAddOns={detail.ingredientAddOns}
          nutrition={detail.nutrition}
        />
      </div>
    </div>
  )
}

function RecipeNutritionTab({
  detail,
  nutrientSource,
  domain,
}: {
  detail: ReturnType<typeof findTemplateDetail>
  nutrientSource: 'COMPUTED' | 'DECLARED' | null
  /** Cosmetic INCI / pet Guaranteed Analysis — when present, the domain block
   *  replaces the (food/supplement) nutrition panel on the right. */
  domain?: DomainFacts
}) {
  const declared = nutrientSource === 'DECLARED'
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
          {detail.nutrition && (
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
          )}
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
            className="rounded-xl border border-ink-200 bg-white p-5"
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
      <div className="border border-ink-200 rounded-lg overflow-x-auto">
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
              <tr key={s.size} className={i % 2 === 0 ? 'bg-white' : 'bg-ink-50/40'}>
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

/** Marketplace rating display — real stars when rated, "New" otherwise (never a
 *  fabricated score). avg is 0–5; count is the number of ratings. */
function RatingStars({ avg, count }: { avg?: number | null; count?: number }) {
  if (!count || avg == null) {
    return <span className="font-semibold text-ink-600">New</span>
  }
  const filled = Math.round(avg)
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-warning-500" aria-hidden="true">
        {'★'.repeat(filled)}
        <span className="text-ink-300">{'★'.repeat(5 - filled)}</span>
      </span>
      <span className="tabular-nums">
        {avg.toFixed(1)} · {count.toLocaleString()} {count === 1 ? 'rating' : 'ratings'}
      </span>
    </span>
  )
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
