// Admin Design Studio — template-author route (docs/DESIGN_TEMPLATE_LIBRARY.md §8).
// Admin-gated (lives in the creator app because CanvasLayoutShell can't be imported
// cross-app). Mounts the SAME creator Studio with neutral, product-less props on a
// chosen die-line + domain; "Save as template" writes to the system templates library.

import { prisma, getOrCreateSystemTemplatesBrand, listActiveDieCuts } from '@ilaunchify/db'
import type { LabelingType } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { deriveTemplateTargeting, type BrandCanvasAssets } from '@ilaunchify/ui'
import { buildBrandCanvasAssets } from '@/lib/brand-canvas-assets'
import { loadCreatorPlanPricing } from '@/lib/plan-pricing'
import { CanvasLayoutShell } from '../products/[productId]/design/canvas/CanvasLayoutShell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Design a template — Admin' }

const VALID_DOMAINS = ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'COSMETIC', 'OTC']

// Fallback surface so Admin Mode always opens, even with no seeded die-cuts.
const BLANK_DIECUT = {
  id: 'blank',
  name: 'Blank surface',
  category: 'CUSTOM',
  widthMm: 100,
  heightMm: 100,
  bleedMm: 3,
  safeAreaMm: 3,
  outlineSvg: '',
}

export default async function TemplateAuthorPage({
  searchParams,
}: {
  searchParams: Promise<{ dieCut?: string; domain?: string }>
}) {
  await requireCapability('catalog:write')
  const sp = await searchParams

  // Admin Mode opens regardless — if no die-cuts are seeded, fall back to a blank
  // generic surface so the admin can still design. Targeting falls back accordingly.
  const dieCuts = await listActiveDieCuts()
  const chosen = dieCuts.find((d) => d.id === sp.dieCut) ?? dieCuts[0] ?? BLANK_DIECUT
  const domain = (sp.domain && VALID_DOMAINS.includes(sp.domain) ? sp.domain : 'FOOD') as LabelingType

  // System templates brand → neutral brand assets for the canvas.
  const brandId = await getOrCreateSystemTemplatesBrand()
  const brand = brandId
    ? await prisma.brand.findUnique({
        where: { id: brandId },
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
      })
    : null
  if (!brand) {
    return (
      <Notice
        title="Templates library unavailable"
        body="The system templates brand could not be created. Run the database seed and try again."
      />
    )
  }

  const brandAssets: BrandCanvasAssets = await buildBrandCanvasAssets(brand)

  // Live plan pricing for the shell's UpgradeOverlay. Admin authors run as
  // 'agency' so the overlay never opens here, but the prop stays real.
  const planPricing = await loadCreatorPlanPricing()

  const dieCutSpec = {
    id: chosen.id,
    name: chosen.name,
    category: chosen.category as never,
    widthMm: chosen.widthMm,
    heightMm: chosen.heightMm,
    bleedMm: chosen.bleedMm,
    safeAreaMm: chosen.safeAreaMm,
    outlineSvg: chosen.outlineSvg || undefined,
  }

  return (
    <CanvasLayoutShell
      productId="template-author"
      productName={chosen.name}
      dieCut={dieCutSpec}
      brandAssets={brandAssets}
      initialDesignJson={null}
      certBadges={[]}
      productCtx={{ allergens: [], bioengineered: false, netQuantity: null, netQuantityKind: 'count' }}
      labelingType={domain}
      creatorTier="agency"
      planPricing={planPricing}
      partnerPrintSpec={null}
      restrictionLabels={[]}
      retailIdentity={{ gtin: null, internalSku: null, barcodeMode: 'NONE' }}
      dielineFrames={null}
      mockups={[]}
      flavors={[]}
      activeFlavorPresetId={null}
      nutritionPanelData={null}
      aggregateNutritionData={null}
      nonFoodPanelData={null}
      templateAuthor={{
        domain,
        dieCutId: chosen.id,
        ...(() => {
          const t = deriveTemplateTargeting({ dieCutCategory: chosen.category, widthMm: chosen.widthMm, heightMm: chosen.heightMm })
          return { container: t.targetContainerCategory, aspectBucket: t.aspectBucket }
        })(),
      }}
    />
  )
}

/** Full-page notice — shown instead of a confusing redirect when a precondition
 *  (active die-cuts / system templates brand) isn't met yet. */
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-ink-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
        <p className="mt-2 text-ui-body text-ink-600">{body}</p>
      </div>
    </div>
  )
}
