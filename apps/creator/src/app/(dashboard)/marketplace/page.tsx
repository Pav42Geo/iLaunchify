import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'
import { MarketplaceFilters } from './MarketplaceFilters'
import { PackageOpen, Factory } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Marketplace — iLaunchify' }

type SearchParams = {
  category?: string | string[]
  subcategory?: string | string[]
  packing?: string | string[]
  certs?: string | string[]
  moqMax?: string
  q?: string
}

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

export default async function MarketplacePage({
  searchParams,
}: { searchParams: Promise<SearchParams> }) {
  // Auth: any logged-in user (CREATOR or PARTNER) can browse.
  // Partners can browse but the "Customize" CTA is hidden in product detail.
  const user = await requireUser()

  // Resolve filters from URL — await once, destructure for use
  const sp = await searchParams
  const categorySlugs = asArray(sp.category)
  const subcategorySlugs = asArray(sp.subcategory)
  const packingTypes = asArray(sp.packing)
  const certs = asArray(sp.certs)
  const moqMax = sp.moqMax ? Number(sp.moqMax) : null
  const search = (sp.q ?? '').trim()

  // Query templates with applied filters
  const templates = await prisma.productTemplate.findMany({
    where: {
      status: 'PUBLISHED',
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(subcategorySlugs.length > 0 && {
        subcategory: { slug: { in: subcategorySlugs } },
      }),
      ...(categorySlugs.length > 0 && subcategorySlugs.length === 0 && {
        subcategory: { category: { slug: { in: categorySlugs } } },
      }),
      ...(packingTypes.length > 0 && {
        variants: {
          some: { packingType: { in: packingTypes as any } },
        },
      }),
      ...(certs.length > 0 && {
        manufacturerService: {
          capabilities: { path: ['certifications'], array_contains: certs as any },
        },
      }),
      ...(moqMax !== null && {
        variants: { some: { moqMin: { lte: moqMax } } },
      }),
    },
    include: {
      subcategory: { include: { category: true } },
      manufacturerService: { include: { partner: true } },
      variants: { where: { isActive: true } },
      _count: { select: { ingredientSlots: true, optionalIngredients: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 60,
  })

  // For filter sidebar — load all categories + subcategories
  const allCategories = await prisma.category.findMany({
    where: { isActive: true },
    include: {
      subcategories: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } },
    },
    orderBy: { displayOrder: 'asc' },
  })

  // Partners can see but can't customize
  const canCustomize = user.role === 'CREATOR' || user.role === 'ADMIN'

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
          <p className="mt-1 text-sm text-zinc-500">
            White-label products from vetted manufacturers · {templates.length} results
          </p>
        </div>
        {!canCustomize && (
          <div className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700">
            Read-only view (partner)
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px,1fr]">
        <MarketplaceFilters
          categories={allCategories}
          selected={{
            categories: categorySlugs,
            subcategories: subcategorySlugs,
            packingTypes,
            certifications: certs,
            moqMax,
            search,
          }}
        />

        <div className="space-y-3">
          {templates.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No matches</CardTitle>
                <CardDescription>Adjust your filters or clear them.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            templates.map((t) => {
              const minVariantMoq = Math.min(...t.variants.map((v) => v.moqMin))
              const packingTypesUsed = Array.from(new Set(t.variants.map((v) => v.packingType)))

              return (
                <Link key={t.id} href={`/marketplace/${t.slug}`}>
                  <Card className="transition-colors hover:bg-zinc-50">
                    <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base">{t.name}</CardTitle>
                        <CardDescription>
                          <span className="font-medium">
                            {t.subcategory.category.icon} {t.subcategory.category.name}
                          </span>
                          {' › '}
                          {t.subcategory.name}
                        </CardDescription>
                        {t.description && (
                          <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{t.description}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5">
                            {t._count.ingredientSlots} ingredients
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5">
                            {t._count.optionalIngredients} optional add-ons
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5">
                            {t.variants.length} variants
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5">
                            MOQ from {minVariantMoq.toLocaleString()}
                          </span>
                          {packingTypesUsed.length > 1 && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                              {packingTypesUsed.length} packing options
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                          <Factory className="h-3 w-3" />
                          {t.manufacturerService?.partner.companyName ?? 'Platform-curated'}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-mono text-base font-semibold">
                          ${(t.priceFloorCents / 100).toFixed(0)}+
                        </div>
                        <div className="text-xs text-zinc-500">price floor</div>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
