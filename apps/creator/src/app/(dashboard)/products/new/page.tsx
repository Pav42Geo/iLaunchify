import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { redirect, notFound } from 'next/navigation'
import { VariantPicker } from './VariantPicker'
import { marketingUrl } from '@/lib/marketing-url'

export const dynamic = 'force-dynamic'

/**
 * Step 1 of the catalog-driven creator flow: pick a variant.
 * Entry is from apps/marketing's /marketplace/[category]/[subcategory]/[slug]
 * "Start Launching" CTA with ?templateId=X. (REBUILD R7 — the creator app no
 * longer hosts a marketplace; we hand visitors back to the public surface for
 * any browse/discovery flow.)
 *
 * On variant pick, a draft Product + Recipe is created (seeded with BASE slot
 * ingredients) and the creator is redirected to /products/[id]/customize.
 */
export default async function NewProductPage({
  searchParams,
}: { searchParams: Promise<{ templateId?: string }> }) {
  const user = await requireUser()
  if (user.role !== 'CREATOR' && user.role !== 'ADMIN') {
    redirect(marketingUrl('/marketplace?error=creator-only'))
  }
  if (!(await searchParams).templateId) redirect(marketingUrl('/marketplace'))

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    include: { brands: true },
  })
  if (!profile) redirect('/onboarding/creator')
  const brand = profile.brands[0]
  if (!brand) redirect('/onboarding/brand')

  const market = await prisma.market.findUnique({ where: { code: 'US' } })
  if (!market) throw new Error('US market missing — run seed.')

  const template = await prisma.productTemplate.findUnique({
    where: { id: (await searchParams).templateId },
    include: {
      subcategory: { include: { category: true } },
      variants: { where: { isActive: true }, include: { dieCutTemplate: true } },
    },
  })
  if (!template || template.status !== 'PUBLISHED') notFound()

  return (
    <div className="space-y-6">
      <div>
        <nav className="mb-2 text-xs text-zinc-500">
          {/* Back to the public marketplace detail page on apps/marketing. */}
          <a
            href={marketingUrl(`/marketplace/${template.subcategory.category.slug}/${template.subcategory.slug}/${template.slug}`)}
            className="hover:underline"
          >
            ← Back to {template.name}
          </a>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">
          Pick a variant of {template.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Each variant has its own flavor, container, packing topology, MOQ, and lead time. You can
          customize ingredients in the next step.
        </p>
      </div>

      <VariantPicker
        templateId={template.id}
        brandId={brand.id}
        marketId={market.id}
        templateName={template.name}
        variants={template.variants.map((v) => ({
          id: v.id,
          flavor: v.flavor,
          containerFormat: v.containerFormat,
          servingsPerContainer: v.servingsPerContainer,
          servingSizeDesc: v.servingSizeDesc ?? `${Number(v.servingSizeG).toFixed(0)}g`,
          packingType: v.packingType,
          innerPacksPerOuter: v.innerPacksPerOuter,
          customerPicksCount: v.customerPicksCount,
          subscriptionInterval: v.subscriptionInterval,
          assortmentFlavors: v.assortmentFlavors as any,
          moqMin: v.moqMin,
          moqMax: v.moqMax,
          leadTimeDays: v.leadTimeDays,
          dieCutName: v.dieCutTemplate?.name ?? null,
        }))}
      />
    </div>
  )
}
