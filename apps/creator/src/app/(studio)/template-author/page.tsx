// Admin Design Studio — template-author route (docs/DESIGN_TEMPLATE_LIBRARY.md §8).
// Admin-gated (lives in the creator app because CanvasLayoutShell can't be imported
// cross-app). Mounts the SAME creator Studio with neutral, product-less props on a
// chosen die-line + domain; "Save as template" writes to the system templates library.

import { redirect } from 'next/navigation'
import { prisma, getOrCreateSystemTemplatesBrand, listActiveDieCuts } from '@ilaunchify/db'
import type { LabelingType } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import type { BrandCanvasAssets } from '@ilaunchify/ui'
import { buildBrandCanvasAssets } from '@/lib/brand-canvas-assets'
import { CanvasLayoutShell } from '../products/[productId]/design/canvas/CanvasLayoutShell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Design a template — Admin' }

const VALID_DOMAINS = ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'COSMETIC', 'OTC']
const CATEGORY_TO_CONTAINER: Record<string, string> = {
  BOTTLE_WRAP: 'BOTTLE',
  TUB_LID: 'JAR',
  POUCH_FRONT: 'POUCH',
  BOX_PANEL: 'BOX',
  STICKER: 'OTHER',
  CUSTOM: 'OTHER',
}

function aspectBucket(w: number, h: number): string | null {
  if (!w || !h) return null
  const r = w / h
  if (r >= 2.5) return 'WRAP'
  if (r >= 1.3) return 'PANEL_WIDE'
  if (r >= 0.8) return 'PANEL_SQUARE'
  if (r >= 0.3) return 'PANEL_TALL'
  return 'LONG_STRIP'
}

export default async function TemplateAuthorPage({
  searchParams,
}: {
  searchParams: Promise<{ dieCut?: string; domain?: string }>
}) {
  await requireCapability('catalog:write')
  const sp = await searchParams

  const dieCuts = await listActiveDieCuts()
  if (dieCuts.length === 0) redirect('/?error=no-diecuts')
  const chosen = dieCuts.find((d) => d.id === sp.dieCut) ?? dieCuts[0]!
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
  if (!brand) redirect('/?error=templates-unavailable')

  const brandAssets: BrandCanvasAssets = await buildBrandCanvasAssets(brand)

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
        container: CATEGORY_TO_CONTAINER[chosen.category] ?? null,
        aspectBucket: aspectBucket(chosen.widthMm, chosen.heightMm),
      }}
    />
  )
}
