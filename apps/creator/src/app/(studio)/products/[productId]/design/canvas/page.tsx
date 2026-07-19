// Design Studio Canvas — server-side loader.
// Per docs/DESIGN_STUDIO_REBUILD.md §3 (canvas layout shell + tool inventory).
//
// Loads the product, its die-cut (via the product's variant), the creator's
// brand assets (logos / colors / fonts / tagline), then hands them all to
// the client-side CanvasLayoutShell which mounts the Fabric.js stage.
//
// Resolves the die-cut from the product's variant. If none yet, falls back
// to a sensible default by product category. Real die-cut assignment lands
// when admin packaging curation (#135) is built.

import { notFound, redirect } from 'next/navigation'
import { prisma, resolveLogoForPlacement, getAiGeneratorSettings } from '@ilaunchify/db'
import type { LabelingType } from '@ilaunchify/db'
import { getCreatorTier, requireUser } from '@ilaunchify/auth'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { resolvePackagingSurfaces } from '@ilaunchify/ui'
import type { BrandCanvasAssets, DieCutSpec, BindableSurface } from '@ilaunchify/ui'
import {
  formatNetQuantity,
  inferNetQuantityKind,
  extractCount,
  extractCountUnit,
} from '@ilaunchify/ui'
import { evaluateProductRestrictions } from '@ilaunchify/marketplace'
import { CanvasLayoutShell } from './CanvasLayoutShell'
import type { StudioMockup } from './MockupModal'
import { loadDesignJson, loadAlternateDesignJson } from './actions'
import { listAlternates } from './alternates-actions'
import { designAlternateCap } from '@ilaunchify/plans'
import { loadProductCertBadges } from './cert-badge-actions'
import { resolveProductPhrases } from './phrase-actions'
import { resolvePartnerPrintSpec } from './partner-spec-actions'
import { loadDielineFrames, type DielineFramesData } from '@/lib/dieline-frames'
import { buildBrandCanvasAssets } from '@/lib/brand-canvas-assets'
import { resolveStudioNutrition, getVarietyPreviewColumns, computeProductLabel } from '@/components/labels/label-actions'
import {
  panelDataToNutritionPanelData,
  varietyColumnsToAggregateNutritionData,
  panelDataToSupplementPanelData,
  petLabelToAafcoPanelData,
} from './lib/nutritionPanelAdapter'
import { mapRecipeIngredients, resolveFlavorRecipe, type FlavorExtra } from '@ilaunchify/orders'
import type { DrugFactsData } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'

// ── F3a per-draft finishes (DISPLAY-ONLY) ─────────────────────────────────────
// The Studio's Finishes drawer surfaces the finishes THIS product offers — the
// partner's ProductTemplateFinish allow-list. Read-only: no object-apply, no
// substrate hard-filter (F3b). Degrades to [] on any error.

/** Serializable material option handed to the (client) Material drawer (F3b). */
export interface StudioMaterial {
  slug: string
  name: string
  /** Short catalog descriptor for the option subtitle. */
  description: string
  /** STANDARD | RECYCLED | ... — surfaces as an eco chip when not STANDARD. */
  sustainabilityTier: string
}

/** Serializable finish row handed to the (client) Finishes drawer. */
export interface StudioFinish {
  partnerFinishId: string
  /** Partner override name, falling back to the FinishType catalog name. */
  name: string
  /** FinishCategory enum value (SURFACE / FOIL_METALLIC / …). */
  category: string
  /** Compact "+$0.08/unit · +2d · MOQ 500" string, or null. */
  pricingSummary: string | null
  leadTimeDays: number
  isDefault: boolean
  isIncludedInPrice: boolean
  note: string | null
  /** Substrate slugs this finish is compatible with (inert until F3b). */
  compatibleSubstrates: string[]
}

function usd(c: number): string {
  return `$${(c / 100).toFixed(2)}`
}

// Mirrors the partner-side pricing-summary formatter (packaging-finishes-actions.ts).
function buildFinishPricingSummary(f: {
  pricingMode: string
  basePriceCents: number
  perUnitPriceCents: number
  pricePerSqInCents: number | null
  pricePerObjectCents: number | null
  pricePerColorCents: number | null
  leadTimeDays: number
  moqMin: number
}): string | null {
  const parts: string[] = []
  switch (f.pricingMode) {
    case 'PER_UNIT':
      if (f.perUnitPriceCents > 0) parts.push(`+${usd(f.perUnitPriceCents)}/unit`)
      break
    case 'PER_AREA':
      if (f.pricePerSqInCents && f.pricePerSqInCents > 0) parts.push(`+${usd(f.pricePerSqInCents)}/sq in`)
      break
    case 'PER_OBJECT':
      if (f.pricePerObjectCents && f.pricePerObjectCents > 0) parts.push(`+${usd(f.pricePerObjectCents)}/object`)
      break
    case 'PER_COLOR':
      if (f.pricePerColorCents && f.pricePerColorCents > 0) parts.push(`+${usd(f.pricePerColorCents)}/color`)
      break
    case 'FLAT_PER_ORDER':
      if (f.basePriceCents > 0) parts.push(`+${usd(f.basePriceCents)}/order`)
      break
    case 'TIERED':
      parts.push('tiered')
      break
    default:
      if (f.perUnitPriceCents > 0) parts.push(`+${usd(f.perUnitPriceCents)}/unit`)
  }
  if (f.pricingMode !== 'FLAT_PER_ORDER' && f.basePriceCents > 0) parts.push(`+${usd(f.basePriceCents)} setup`)
  if (f.leadTimeDays > 0) parts.push(`+${f.leadTimeDays}d`)
  if (f.moqMin > 0) parts.push(`MOQ ${f.moqMin.toLocaleString()}`)
  return parts.length ? parts.join(' · ') : null
}

/**
 * Load the finishes a product template offers, for the DISPLAY-ONLY Studio
 * drawer (F3a). Degrades to [] on any error.
 */
// F3b — the ACTIVE label-stock + packaging-material catalogs the creator picks
// from in the Studio Material drawer. Mirrors loadStudioFinishes: server-side,
// serialisable, degrades to [] on error. NOT price-bearing (Blocker 2/4): these
// are production specs for the manifest, not cost inputs.
// #39 cleanup: packaging material is retired (packaging is a PDP choice now), so the
// Studio loads only the label-stock (substrate) catalog.
async function loadStudioMaterials(): Promise<{ substrates: StudioMaterial[] }> {
  try {
    const subs = await prisma.substrate.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true, description: true, sustainabilityTier: true },
    })
    const map = (r: { slug: string; name: string; description: string; sustainabilityTier: string }) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      sustainabilityTier: String(r.sustainabilityTier),
    })
    return { substrates: subs.map(map) }
  } catch (err) {
    console.error('[loadStudioMaterials] failed:', err)
    return { substrates: [] }
  }
}

async function loadStudioFinishes(productTemplateId: string | null): Promise<StudioFinish[]> {
  if (!productTemplateId) return []
  try {
    const rows = await prisma.productTemplateFinish.findMany({
      where: { productTemplateId },
      orderBy: { sortOrder: 'asc' },
      include: { partnerFinish: { include: { finishType: true } } },
    })

    return rows
      .filter((r) => r.partnerFinish)
      .map((r) => {
        const pf = r.partnerFinish!
        return {
          partnerFinishId: r.partnerFinishId,
          name: pf.name?.trim() || pf.finishType.name,
          category: String(pf.finishType.category),
          pricingSummary: buildFinishPricingSummary({
            pricingMode: String(pf.pricingMode),
            basePriceCents: pf.basePriceCents,
            perUnitPriceCents: pf.perUnitPriceCents,
            pricePerSqInCents: pf.pricePerSqInCents,
            pricePerObjectCents: pf.pricePerObjectCents,
            pricePerColorCents: pf.pricePerColorCents,
            leadTimeDays: pf.leadTimeDays,
            moqMin: pf.moqMin,
          }),
          leadTimeDays: pf.leadTimeDays,
          isDefault: r.isDefault,
          isIncludedInPrice: r.isIncludedInPrice,
          note: r.note,
          compatibleSubstrates: pf.compatibleSubstrates ?? [],
        }
      })
  } catch (err) {
    console.error('[loadStudioFinishes] failed:', err)
    return []
  }
}

interface PageProps {
  params: Promise<{ productId: string }>
  searchParams: Promise<{ flavor?: string; alt?: string }>
}

export default async function DesignStudioCanvasPage({ params, searchParams }: PageProps) {
  const { productId } = await params
  const { flavor: flavorParam, alt: altParam } = await searchParams
  const user = await requireUser()

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      brand: { creatorProfile: { userId: user.id } },
    },
    select: {
      id: true,
      name: true,
      category: true,
      // Versioning v2 §4.3 — PUBLISHED products get a warning line in the
      // promote-alternate confirm dialog (no re-approval gate in V1).
      status: true,
      // Creator-selection scoping (docs/SELECTION_THREADING_AUDIT.md) — the
      // flavors the creator picked; scopes the Studio's flavor switcher.
      selectedFlavorPresetIds: true,
      // Retail identity (GTIN / internal SKU / barcode mode) — relocated from the
      // retired product hub into the Studio Product panel (2026-06-18).
      gtin: true,
      internalSku: true,
      barcodeMode: true,
      brand: {
        select: {
          id: true,
          name: true,
          tagline: true,
          colorPrimary: true,
          colorSecondary: true,
          colorAccent: true,
          brandSwatches: true,
          brandFontIds: true,
          logoAssetId: true,
          logoIconAssetId: true,
          logoHorizontalAssetId: true,
        },
      },
      // ---- DS-56 productCtx inputs ----
      // Recipe ingredients → derives allergens + bioengineered flag.
      // Variant → derives net-quantity string.
      recipe: {
        select: {
          servingSizeG: true,
          servingsPerContainer: true,
          servingSizeDesc: true,
          ingredients: {
            orderBy: { position: 'asc' },
            select: {
              weightG: true,
              position: true,
              source: true,
              filledSlotId: true,
              ingredient: {
                select: {
                  id: true,
                  name: true,
                  labelDeclarationName: true,
                  allergenFlags: true,
                  allergens: true, // legacy field, fall back when allergenFlags empty
                  bioengineeredStatus: true,
                },
              },
            },
          },
        },
      },
      variant: {
        select: {
          containerFormat: true,
          containerSizeG: true,
          // The manufacturer's chosen die-line for this variant — the Studio uses
          // it directly (a serum gets its dropper bottle, greens their sachet),
          // falling back to a category default only when unset.
          dieCutTemplateId: true,
          // Mockup Slice 2 — drives which photo-mockup (by PackagingType) to warp
          // the design into.
          packagingTypeId: true,
        },
      },
      // C4.b — labeling type drives label-format recommendation. Lives on the
      // manufacturer template; default to FOOD when unbound.
      // phraseFacts also feeds the restricted-category eligibility check.
      productTemplate: {
        select: {
          id: true,
          // PS-8 — template status drives the coverage-paused banner. When the
          // nightly sweep finds a published template with zero print coverage it
          // flips status → PAUSED and re-broadcasts a capability RFQ.
          status: true,
          labelingType: true,
          phraseFacts: true,
          // Product details drawer — owner-pinned manufacturer + pricing/MOQ summary.
          manufacturerService: { select: { partner: { select: { companyName: true } } } },
          pricingTiers: {
            orderBy: [{ fulfillmentMode: 'asc' }, { sortOrder: 'asc' }],
            select: { fulfillmentMode: true, minQty: true, maxQty: true, perUnitCostCents: true, leadTimeDays: true },
          },
          // Per-flavor labels — labelTopology PER_FLAVOR + the flavor pool drive
          // the Studio's flavor switcher; each flavor persists its own Design.
          packingProfile: { select: { labelTopology: true } },
          flavorPresets: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, swatchHex: true, statementOfIdentity: true, extras: true },
          },
        },
      },
    },
  })
  if (!product) notFound()

  // Creator-selection scoping (docs/SELECTION_THREADING_AUDIT.md): the Studio must show ONLY the
  // flavors the creator picked on the product detail page — not the full template pool. The
  // column rides the main product query; empty = legacy/unselected → fall back to the full
  // pool so existing products keep working.
  const selectedFlavorIds = product.selectedFlavorPresetIds ?? []

  // Per-flavor label design (docs/HANDOFF-TO-CODE-per-flavor-labels.md). When the
  // packing type is individually-labeled and the template offers flavors, the
  // Studio shows a flavor switcher; ?flavor=<id> selects which flavor's Design to
  // load/save (null/absent = the shared base design). Scoped to the creator's selection.
  const allFlavorPresets = product.productTemplate?.flavorPresets ?? []
  const flavorPresets = selectedFlavorIds.length
    ? allFlavorPresets.filter((f) => selectedFlavorIds.includes(f.id))
    : allFlavorPresets
  const perFlavor =
    product.productTemplate?.packingProfile?.labelTopology === 'PER_FLAVOR' && flavorPresets.length > 0
  const flavors = perFlavor
    ? flavorPresets.map((f) => ({ id: f.id, name: f.name, swatchHex: f.swatchHex }))
    : []
  // Validate the requested flavor against the pool; unknown/absent → base (null).
  const activeFlavorPresetId =
    perFlavor && flavorParam && flavors.some((f) => f.id === flavorParam) ? flavorParam : null

  // Product-picture Details modal (docs/CREATOR_PRODUCT_PICTURE_MODAL.md, slice 2) —
  // per-flavor Statement of Identity + FINAL recipe (base + FlavorPreset.extras) for the
  // SELECTED flavors, plus the single-product recipe + exact topology. Rendered Facts
  // panels are slice 3.
  const baseIngredients = mapRecipeIngredients(
    (product.recipe?.ingredients ?? []).map((ri) => ({
      weightG: Number(ri.weightG),
      position: ri.position,
      source: ri.source,
      filledSlotId: ri.filledSlotId,
      ingredient: ri.ingredient,
    })),
  )
  const toPictureRecipe = (ingredients: typeof baseIngredients) => ({
    servingSize:
      product.recipe?.servingSizeDesc ?? (product.recipe ? `${Number(product.recipe.servingSizeG)}g` : null),
    servings: product.recipe ? Number(product.recipe.servingsPerContainer) : null,
    ingredients: ingredients.map((i) => ({
      name: i.labelDeclarationName ?? i.ingredientId,
      weightG: i.weightG,
      source: i.source,
    })),
  })
  const pictureFlavors = perFlavor
    ? flavorPresets.map((f) => ({
        flavorPresetId: f.id,
        statementOfIdentity: f.statementOfIdentity ?? null,
        recipe: product.recipe
          ? toPictureRecipe(
              resolveFlavorRecipe(baseIngredients, (Array.isArray(f.extras) ? f.extras : []) as unknown as FlavorExtra[]),
            )
          : null,
      }))
    : []
  const pictureBaseRecipe = !perFlavor && product.recipe ? toPictureRecipe(baseIngredients) : null
  const labelTopology = (product.productTemplate?.packingProfile?.labelTopology ?? 'SINGLE') as
    | 'SINGLE'
    | 'AGGREGATE'
    | 'PER_FLAVOR'

  // Phase 2b — REAL Nutrition Facts data for the active flavor (or base) so the
  // Label drawer's panel reflects the actual recipe, not sample data. FOOD only;
  // other domains → null → the drawer falls back to its sample/domain panel.
  const studioNutrition = await resolveStudioNutrition(productId, activeFlavorPresetId)
  const nutritionPanelData =
    studioNutrition.ok && studioNutrition.domain === 'FOOD'
      ? panelDataToNutritionPanelData(studioNutrition.panel)
      : null

  // Phase 2b — REAL multi-column aggregate panel (variety box, AGGREGATE topology):
  // every flavor's recomputed nutrition as side-by-side columns. Null when there
  // are no per-flavor recipes → the Label drawer keeps its sample aggregate.
  const variety = await getVarietyPreviewColumns(productId)
  const aggregateNutritionData =
    variety.ok && variety.columns.length > 0
      ? varietyColumnsToAggregateNutritionData(variety.columns)
      : null

  // Phase 2b Step E — REAL non-FOOD panels (supplement / pet). Bundled into one
  // prop; null per slot when the domain doesn't match → sample renderer.
  const nonFoodPanelData =
    studioNutrition.ok && studioNutrition.domain === 'SUPPLEMENT'
      ? {
          supplement: panelDataToSupplementPanelData(
            studioNutrition.panel,
            studioNutrition.otherIngredients,
          ),
          aafco: null,
        }
      : studioNutrition.ok && studioNutrition.domain === 'PET'
        ? { supplement: null, aafco: petLabelToAafcoPanelData(studioNutrition) }
        : null

  // ---- Resolve die-cut ------------------------------------------------------
  // V1: pick a sensible default per product category until admin packaging
  // curation (#135) actually assigns die-cuts to products.
  // Die-line resolution order: (1) the variant's own manufacturer-chosen
  // die-line; (2) the admin-curated default for the variant's packaging type
  // (#135); (3) a category guess. So a product always lands on its real cut.
  const dieCut =
    (await resolveDieCutById(product.variant?.dieCutTemplateId ?? null)) ??
    (await resolveDieCutById(await resolvePackagingTypeDieCut(product.variant?.packagingTypeId ?? null))) ??
    (await resolveDefaultDieCut(studioCategory(product.category)))
  if (!dieCut) {
    // No die-cuts seeded — kick back to product overview with a clear hint.
    redirect(`/products/${productId}?error=no-diecut-available`)
  }

  // ---- Resolve brand assets -------------------------------------------------
  // Shared builder (also used by the in-Studio brand switcher) — colors / fonts /
  // logos / tagline for the product's brand kit.
  const brandAssets: BrandCanvasAssets = await buildBrandCanvasAssets(product.brand)

  // Alternates (versioning v2 §4.3) — sibling design candidates for the slot on
  // canvas. ?alt=<designId> selects a specific sibling (validated against the
  // slot); absent/unknown → the Active sibling. Cast-guarded server action →
  // [] pre-push, and everything below falls back to pre-v2 behavior.
  const slotAlternates = await listAlternates(productId, { flavorPresetId: activeFlavorPresetId })
  const requestedAlt = altParam && slotAlternates.some((a) => a.id === altParam) ? altParam : null
  const activeDesignId = requestedAlt ?? slotAlternates.find((a) => a.isActiveAlternate)?.id ?? null

  // Hydrate the canvas with any previously-saved Fabric state. Null → fresh
  // empty canvas (first time editing this product). With alternates resolved,
  // load by EXACT design id (deterministic even while the legacy findFirst
  // readers await their isActiveAlternate filters); fall back to the flavor-slot
  // loader pre-push / pre-alternates.
  const initialDesignJson = (
    activeDesignId
      ? await loadAlternateDesignJson(product.id, activeDesignId)
      : await loadDesignJson(product.id, activeFlavorPresetId)
  ) as object | null

  // Cert badges (DESIGN_STUDIO.md §Certificate badges V1) — the product's earned
  // certs, surfaced as managed vector badges on the host surface's canvas.
  const { badges: certBadges } = await loadProductCertBadges(product.id)

  // R14.d — real subscription tier from the DB (defaults to 'maker' for
  // anyone without a CreatorProfile row, e.g. admin impersonation).
  const creatorTier = await getCreatorTier(user.id)

  // ---- DS-56 derive productCtx for compliance scan + label drawer pre-fill -
  const productCtx = deriveProductCtx({
    category: studioCategory(product.category),
    recipe: product.recipe,
    variant: product.variant,
  })

  // The product's labeling REGIME drives which Facts panel + which label formats
  // the Studio offers (Nutrition vs Supplement vs Drug vs AAFCO) — it is never a
  // free choice. The manufacturer's template is authoritative; when it hasn't set
  // a labelingType we DERIVE one from the product category so a Supplement can
  // NEVER silently fall back to Nutrition Facts (the previous `?? 'FOOD'` did).
  const labelingType = resolveLabelingRegime(
    product.productTemplate?.labelingType ?? null,
    studioCategory(product.category),
  )

  // COSMETIC INCI + OTC Drug Facts for the product-picture panel (slice 3) — from the
  // template's persisted formulation. Only computed for those domains.
  const nonFoodLabel =
    labelingType === 'COSMETIC' || labelingType === 'OTC' ? await computeProductLabel(productId) : null
  const pictureCosmeticData =
    (nonFoodLabel?.ok
      ? (nonFoodLabel.data.find((l) => l.domain === 'COSMETIC') as
          | { ingredients: string; netContents?: string; responsiblePerson?: string; adverseEventContact?: string }
          | undefined)
      : undefined) ?? null
  const pictureOtcData =
    (nonFoodLabel?.ok
      ? (nonFoodLabel.data.find((l) => l.domain === 'OTC') as { drugFacts: DrugFactsData } | undefined)?.drugFacts
      : undefined) ?? null

  // Per-product required (locked-mandatory) phrases — the compliance scanner
  // flags any whose text is missing from the canvas. Reuses the same resolver
  // the Phrases drawer uses (engine + live recipe).
  const resolvedPhrases = await resolveProductPhrases(product.id, labelingType)
  const lockedPhrases = resolvedPhrases
    .filter((p) => p.locked)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      body: p.body,
      citation: p.cfrCitation,
    }))

  // C9 — resolve the bound print partner's output spec (if any) so the export
  // modal can run prepress pre-flight. Null for almost all products today
  // (no PRIMARY component bound to an offering with a print-output spec) →
  // pre-flight simply skips, no export-gate change.
  const partnerPrintSpec = await resolvePartnerPrintSpec(product.id)

  // Restricted-category eligibility (labeling ≠ licensing). Surfaced as a
  // Studio top-bar banner so a creator learns their product can't be ordered
  // BEFORE investing design effort — not at the final checkout step. Uses the
  // resolved regime (so an OTC product trips too) + manufacturer facts + recipe.
  const restrictionLabels = evaluateProductRestrictions({
    labelingType,
    phraseFacts: (product.productTemplate?.phraseFacts ?? null) as Record<string, unknown> | null,
    ingredientNames: (product.recipe?.ingredients ?? []).map(
      (ri) => ri.ingredient.labelDeclarationName ?? ri.ingredient.name,
    ),
  }).map((h) => h.label)

  // PS-8 (docs/HANDOFF-TO-CODE-coverage-guard-copy.md) — defense-in-depth: if a
  // template a creator is mid-design on was auto-PAUSED for lost print coverage
  // (and still has an OPEN/CLAIMED capability RFQ), show a reassuring banner and
  // block ordering while the printer is being re-arranged. Deliberately rare —
  // §10.1's activation gate stops a creator ever *starting* an uncoverable
  // product. .catch guards the query pre-migration (tables land with db:push).
  const coveragePausedTemplateId = product.productTemplate?.id ?? null
  const pausedForCoverage =
    product.productTemplate?.status === 'PAUSED' &&
    coveragePausedTemplateId != null &&
    (await prisma.printCapabilityRequest
      .count({
        where: {
          productTemplateId: coveragePausedTemplateId,
          status: { in: ['OPEN', 'CLAIMED'] },
        },
      })
      .catch(() => 0)) > 0

  // Dieline Phase B — resolve the product's die-line frames + context so the
  // canvas can render frame guides + run the staleness/bounds gate.
  const dielineFrames = await loadDielineFrames(productId, user.id)

  // Mockup Slice 2/3 — resolve ALL ACTIVE photo-mockups for this product's
  // packaging type so MockupModal can warp the design onto real product photos
  // and the creator can browse/switch between surfaces (front/back/wrap).
  // Empty → MockupModal keeps its stylized CSS variants (graceful fallback).
  const mockups = await loadActiveMockups(product.variant?.packagingTypeId ?? null)

  const studioLogo = await resolveLogoForPlacement('creatorCanvas')

  // F3a — finishes this product offers (partner's ProductTemplateFinish allow-
  // list). DISPLAY-ONLY in the Studio drawer; cast-guarded → [] pre-migration.
  const studioFinishes = await loadStudioFinishes(product.productTemplate?.id ?? null)
  const partnerOffersFinishes = studioFinishes.length > 0

  // F3b — the label-stock + packaging-material catalogs the creator picks from in
  // the Material drawer. placeOrder requires both; this is the only surface that
  // writes them, so an empty catalog here means the creator cannot check out.
  const studioMaterials = await loadStudioMaterials()

  // Platform-wide AI generator kill switch (admin → AI Generator settings). When
  // off, the AI Templator is hidden from the Studio rail. Defaults to true if the
  // settings row is missing, so the generator is never accidentally dark.
  const aiGeneratorEnabled = (await getAiGeneratorSettings()).gates.generatorEnabled

  // Product details drawer meta — category + owner-pinned manufacturer + a full cost summary
  // (per-unit by quantity tier) + the entry tier (lowest minQty) for the header MOQ line.
  // All fields already decided upstream in the builder.
  const pricingTiers = product.productTemplate?.pricingTiers ?? []
  const entryTier = pricingTiers.length ? pricingTiers.reduce((a, b) => (b.minQty < a.minQty ? b : a)) : null
  const fulfillmentLabel = (m: string): string =>
    m === 'ON_DEMAND' ? 'On-demand' : m === 'BOTH' ? 'Bulk + On-demand' : 'Bulk'
  const qtyRange = (min: number, max: number | null): string =>
    max ? `${min.toLocaleString()}–${max.toLocaleString()}` : `${min.toLocaleString()}+`
  const centsList = pricingTiers.map((t) => t.perUnitCostCents)
  const lowC = centsList.length ? Math.min(...centsList) : null
  const highC = centsList.length ? Math.max(...centsList) : null
  const cost =
    pricingTiers.length && lowC != null && highC != null
      ? {
          low: usd(lowC),
          high: usd(highC),
          single: lowC === highC,
          tiers: pricingTiers
            .slice()
            .sort((a, b) => a.minQty - b.minQty)
            .map((t) => ({
              qtyRange: qtyRange(t.minQty, t.maxQty ?? null),
              perUnit: usd(t.perUnitCostCents),
              leadTimeDays: t.leadTimeDays ?? null,
              fulfillment: fulfillmentLabel(String(t.fulfillmentMode)),
            })),
        }
      : null
  // Packaging (container) info — the physical package the product ships in.
  const packaging = await loadPackagingInfo(product.variant?.packagingTypeId ?? null, product.variant?.containerFormat ?? null)
  const { url: model3dUrl, surfaces: modelSurfaces } = await loadPackagingModel3d(product.variant?.packagingTypeId ?? null)
  const productMeta = {
    category: product.category ?? null,
    manufacturerName: product.productTemplate?.manufacturerService?.partner?.companyName ?? null,
    moq: entryTier?.minQty ?? null,
    leadTimeDays: entryTier?.leadTimeDays ?? null,
    fulfillment: entryTier ? fulfillmentLabel(String(entryTier.fulfillmentMode)) : null,
    cost,
    packaging,
  }

  return (
    <CanvasLayoutShell
      studioLogo={studioLogo}
      productId={product.id}
      productName={product.name}
      dieCut={dieCut}
      model3dUrl={model3dUrl}
      modelSurfaces={modelSurfaces}
      productMeta={productMeta}
      brandAssets={brandAssets}
      initialDesignJson={initialDesignJson}
      certBadges={certBadges}
      productCtx={{ ...productCtx, lockedPhrases }}
      labelingType={labelingType}
      creatorTier={creatorTier}
      partnerPrintSpec={partnerPrintSpec}
      restrictionLabels={restrictionLabels}
      pausedForCoverage={pausedForCoverage}
      retailIdentity={{
        gtin: product.gtin,
        internalSku: product.internalSku,
        barcodeMode: product.barcodeMode as 'NONE' | 'RETAIL_UPC' | 'INTERNAL_SKU',
      }}
      dielineFrames={dielineFrames}
      mockups={mockups}
      flavors={flavors}
      activeFlavorPresetId={activeFlavorPresetId}
      alternates={slotAlternates}
      activeDesignId={activeDesignId}
      alternateCap={designAlternateCap(creatorTier)}
      productPublished={product.status === 'PUBLISHED'}
      nutritionPanelData={nutritionPanelData}
      aggregateNutritionData={aggregateNutritionData}
      nonFoodPanelData={nonFoodPanelData}
      partnerOffersFinishes={partnerOffersFinishes}
      aiGeneratorEnabled={aiGeneratorEnabled}
      finishes={studioFinishes}
      substrates={studioMaterials.substrates}
      pictureFlavors={pictureFlavors}
      pictureBaseRecipe={pictureBaseRecipe}
      labelTopology={labelTopology}
      pictureSinglePanel={studioNutrition.ok && 'panel' in studioNutrition ? studioNutrition.panel : null}
      pictureVarietyColumns={variety.ok ? variety.columns : []}
      picturePetData={
        studioNutrition.ok && studioNutrition.domain === 'PET'
          ? {
              gaRows: studioNutrition.gaRows,
              ingredients: studioNutrition.ingredients,
              adequacyStatement: studioNutrition.adequacyStatement ?? null,
              feedingDirections: studioNutrition.feedingDirections ?? null,
            }
          : null
      }
      pictureCosmeticData={pictureCosmeticData}
      pictureOtcData={pictureOtcData}
    />
  )
}

/**
 * Resolve ALL ACTIVE photo-mockups for a packaging type (Mockup Slice 2/3), so
 * the creator can browse/switch between surfaces. Ordered front-first, then
 * displayOrder. Cast-guarded: the MockupTemplate migration may be pending → any
 * failure yields [], and the Studio falls back to the stylized CSS mockups.
 * Skips any row whose base photo has no public URL or whose quad is malformed.
 */
async function loadActiveMockups(packagingTypeId: string | null): Promise<StudioMockup[]> {
  if (!packagingTypeId) return []
  try {
    const rows = await prisma.mockupTemplate.findMany({
      where: { packagingTypeId, status: 'ACTIVE' },
      orderBy: { displayOrder: 'asc' },
      select: { label: true, baseImageAssetId: true, printAreaQuad: true, surfaceKey: true },
    })
    if (!rows.length) return []

    const assetIds = [...new Set(rows.map((r) => r.baseImageAssetId))]
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, publicUrl: true },
    })
    const urlById = new Map(assets.map((a) => [a.id, a.publicUrl]))

    const out: StudioMockup[] = []
    for (const r of rows) {
      const quad = normalizeQuad(r.printAreaQuad)
      const url = urlById.get(r.baseImageAssetId)
      if (!quad || !url) continue
      out.push({ imageUrl: url, printAreaQuad: quad, label: r.label, surfaceKey: r.surfaceKey })
    }
    // Front surface first; the rest keep their displayOrder (stable sort).
    out.sort((a, b) => Number(b.surfaceKey === 'front') - Number(a.surfaceKey === 'front'))
    return out
  } catch {
    return []
  }
}

/** Validate a printAreaQuad Json into exactly 4 {x,y} points (image-relative 0..1). */
function normalizeQuad(raw: unknown): Array<{ x: number; y: number }> | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const pts: Array<{ x: number; y: number }> = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') return null
    const x = (p as { x?: unknown }).x
    const y = (p as { y?: unknown }).y
    if (typeof x !== 'number' || typeof y !== 'number') return null
    pts.push({ x, y })
  }
  return pts
}

/**
 * Resolve the regulatory labeling regime that drives the Studio's Facts panel +
 * label-format options. This must be robust to bad data: a dietary supplement is
 * legally required to use the Supplement Facts panel (21 CFR 101.36), NOT
 * Nutrition Facts — so a SUPPLEMENT-category product ALWAYS resolves to the
 * supplement regime, even when its manufacturer template carries a stale/wrong
 * `labelingType` of FOOD (a real seed inconsistency: most supplement products
 * have FOOD on the template). The category — the creator's explicit product
 * type — wins for that high-risk split, so the wrong panel can never ship.
 *
 * For FOOD / BEVERAGE_FUNCTIONAL products the manufacturer template is
 * authoritative — it's the only place OTC / PET_PRODUCT / COSMETIC (regimes the
 * V1 ProductCategory enum can't express) come from; default FOOD when unset.
 */
function resolveLabelingRegime(
  templateLabelingType: LabelingType | null,
  category: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT',
): LabelingType {
  if (category === 'SUPPLEMENT') return 'DIETARY_SUPPLEMENT'
  return templateLabelingType ?? 'FOOD'
}

/**
 * Narrow the owned-Product category to the three the Studio helpers branch on.
 * COSMETIC + PET were added to ProductCategory (2026-06-28) for ownership/sample
 * support; in the Studio they behave like their closest packaging regime
 * (cosmetic → bottle, pet → pouch). The TRUE label regime is never lost — it
 * still comes from the template's labelingType via resolveLabelingRegime.
 */
function studioCategory(c: string): 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT' {
  if (c === 'SUPPLEMENT') return 'SUPPLEMENT'
  if (c === 'BEVERAGE_FUNCTIONAL' || c === 'COSMETIC') return 'BEVERAGE_FUNCTIONAL'
  return 'FOOD'
}

/**
 * Derive the LabelScanContext from the loaded product + recipe + variant.
 *
 *   allergens     = unique union of every recipe ingredient's allergenFlags
 *                   (legacy 'allergens' as fallback for pre-2026-05-24 rows).
 *   bioengineered = true if any ingredient has bioengineeredStatus = BIOENGINEERED.
 *   netQuantity   = variant.containerFormat (human-readable, e.g. "12oz can")
 *                   when present, else `${containerSizeG}g`, else null.
 */
function deriveProductCtx(product: {
  category: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT'
  recipe: {
    ingredients: Array<{
      ingredient: {
        allergenFlags: string[]
        allergens: string[]
        // Prisma's enum type is structural-equivalent to this string union, so
        // we use string here to avoid importing the Prisma enum into the page.
        bioengineeredStatus: string
      }
    }>
  } | null
  variant: { containerFormat: string; containerSizeG: unknown } | null
}): {
  allergens: string[]
  bioengineered: boolean
  netQuantity: string | null
  netQuantityKind: 'solid' | 'liquid' | 'count'
} {
  const allergenSet = new Set<string>()
  let bioengineered = false
  for (const ri of product.recipe?.ingredients ?? []) {
    const flags = ri.ingredient.allergenFlags.length
      ? ri.ingredient.allergenFlags
      : ri.ingredient.allergens
    for (const a of flags) allergenSet.add(a.toLowerCase())
    if (ri.ingredient.bioengineeredStatus === 'BIOENGINEERED') {
      bioengineered = true
    }
  }

  // ---- DS-57 FDA-compliant net quantity (21 CFR 101.105) ----
  // Pick the format kind from containerFormat hints + product category, then
  // hand grams/count to the formatter. Returns "NET WT 12 OZ (340g)" /
  // "NET 16 FL OZ (473 mL)" / "60 CAPSULES" depending on the kind.
  const containerFormat = product.variant?.containerFormat ?? null
  const grams =
    product.variant?.containerSizeG != null
      ? Number(String(product.variant.containerSizeG))
      : null
  const kind = inferNetQuantityKind(containerFormat, product.category)
  let netQuantity: string | null = null
  if (kind === 'count') {
    const count = extractCount(containerFormat)
    const unit = extractCountUnit(containerFormat) ?? 'COUNT'
    netQuantity = formatNetQuantity({ kind, count, countUnit: unit })
  } else if (kind === 'liquid') {
    // V1: when only grams are stored, treat as water-equivalent volume
    // (1g ≈ 1mL). Per-product density support lands when the variant gains
    // a milliliters column — leaving a forward marker here.
    netQuantity = formatNetQuantity({ kind, milliliters: grams })
  } else {
    netQuantity = formatNetQuantity({ kind, grams })
  }
  // Last-resort fallback so the LabelDrawer still has a placeholder when the
  // variant is bare. Marks it with a question mark so the creator notices.
  if (!netQuantity && containerFormat) {
    netQuantity = `NET WT ${containerFormat} (?g)`
  }

  return {
    allergens: Array.from(allergenSet).sort(),
    bioengineered,
    netQuantity,
    netQuantityKind: kind,
  }
}

// Pick a default DieCutTemplate by product category.
// V1 fallback: first ACTIVE die-cut whose category roughly matches the product.
// The admin-curated default die-line for a packaging type (#135). Cast-guarded
// so it compiles before the client is regenerated for the new column.
// Packaging (container) info for the Product drawer's Packaging accordion.
// Degrades to null on any error.
async function loadPackagingInfo(
  packagingTypeId: string | null,
  containerFormat: string | null,
): Promise<{ container: string; category: string | null; fragility: string | null; dimensions: string | null; format: string | null } | null> {
  if (!packagingTypeId) return null
  const row = await prisma.packagingType
    .findUnique({
      where: { id: packagingTypeId },
      select: { displayName: true, containerCategory: true, fragilityClass: true, defaultDimensions: true },
    })
    .catch(() => null)
  if (!row) return null
  const d = row.defaultDimensions as { lengthMm?: number; widthMm?: number; heightMm?: number } | null
  const dims =
    d && (d.lengthMm || d.widthMm || d.heightMm)
      ? `${d.lengthMm ?? '?'} × ${d.widthMm ?? '?'} × ${d.heightMm ?? '?'} mm`
      : null
  return {
    container: row.displayName,
    category: row.containerCategory,
    fragility: row.fragilityClass,
    dimensions: dims,
    format: containerFormat,
  }
}

async function resolvePackagingTypeDieCut(packagingTypeId: string | null): Promise<string | null> {
  if (!packagingTypeId) return null
  const row = await prisma.packagingType
    .findUnique({ where: { id: packagingTypeId }, select: { defaultDieCutTemplateId: true } })
    .catch(() => null)
  return row?.defaultDieCutTemplateId ?? null
}

// Load a specific die-cut by id (the variant's manufacturer-chosen die-line).
async function resolveDieCutById(id: string | null): Promise<DieCutSpec | null> {
  if (!id) return null
  const row = await prisma.dieCutTemplate.findFirst({
    where: { id, isActive: true },
    select: {
      id: true, name: true, category: true, widthMm: true, heightMm: true,
      bleedMm: true, safeAreaMm: true, outlineSvg: true,
    },
  })
  if (!row) return null
  return {
    id: row.id, name: row.name, category: row.category as DieCutSpec['category'],
    widthMm: row.widthMm, heightMm: row.heightMm, bleedMm: row.bleedMm,
    safeAreaMm: row.safeAreaMm, outlineSvg: row.outlineSvg,
  }
}

async function resolveDefaultDieCut(
  productCategory: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT',
): Promise<DieCutSpec | null> {
  const categoryPreference: Record<typeof productCategory, string[]> = {
    SUPPLEMENT: ['BOTTLE_WRAP', 'TUB_LID', 'STICKER'],
    BEVERAGE_FUNCTIONAL: ['BOTTLE_WRAP', 'STICKER'],
    FOOD: ['POUCH_FRONT', 'BOX_PANEL', 'STICKER'],
  }
  const preferred = categoryPreference[productCategory]
  for (const cat of preferred) {
    const row = await prisma.dieCutTemplate.findFirst({
      where: { category: cat as 'BOTTLE_WRAP' | 'TUB_LID' | 'POUCH_FRONT' | 'BOX_PANEL' | 'STICKER' | 'CUSTOM', isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        widthMm: true,
        heightMm: true,
        bleedMm: true,
        safeAreaMm: true,
        outlineSvg: true,
      },
    })
    if (row) {
      return {
        id: row.id,
        name: row.name,
        category: row.category as DieCutSpec['category'],
        widthMm: row.widthMm,
        heightMm: row.heightMm,
        bleedMm: row.bleedMm,
        safeAreaMm: row.safeAreaMm,
        outlineSvg: row.outlineSvg,
      }
    }
  }
  // No die-cuts at all
  return null
}

/** Signed URL + authored surface map for the packaging type's imported glTF model.
 *  Feeds the Live 3D preview so a real uploaded container renders with the design bound
 *  to the correct surface (G1.4 imported-model path + exact per-surface binding). */
async function loadPackagingModel3d(packagingTypeId: string | null): Promise<{ url: string | null; surfaces: BindableSurface[] }> {
  if (!packagingTypeId) return { url: null, surfaces: [] }
  const row = await prisma.packagingType
    .findUnique({ where: { id: packagingTypeId }, select: { model3dKey: true, defaultSurfaces: true } })
    .catch(() => null)
  if (!row) return { url: null, surfaces: [] }
  const surfaces: BindableSurface[] = resolvePackagingSurfaces(row.defaultSurfaces).map((s) => ({
    key: s.key,
    label: s.label,
    part: s.part,
    role: s.role,
  }))
  const url = row.model3dKey ? await getSignedReadUrl(row.model3dKey, { expiresInSeconds: 600 }).catch(() => null) : null
  return { url, surfaces }
}
