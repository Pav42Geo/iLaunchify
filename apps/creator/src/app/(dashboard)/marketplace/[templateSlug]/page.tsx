import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ilaunchify/ui'
import Link from 'next/link'
import { Factory, Boxes, Settings2, Layers } from 'lucide-react'

export const dynamic = 'force-dynamic'

const PACKING_LABELS: Record<string, string> = {
  SINGLE_FLAVOR_SINGLE_PACK: 'Single pack',
  SINGLE_FLAVOR_MULTIPACK: 'Multipack',
  MULTI_FLAVOR_MIXED_PACK: 'Mixed bag',
  MULTI_FLAVOR_COMPARTMENT_PACK: 'Compartment pack',
  MULTI_FLAVOR_INDIVIDUAL_IN_OUTER: 'Variety pack',
  CUSTOMIZABLE_PICK_N: 'Customer pick',
  SAMPLER_MINI: 'Sampler',
  SUBSCRIPTION_ROTATING: 'Subscription',
  GIFT_PREMIUM: 'Gift pack',
  VALUE_BULK_SINGLE: 'Bulk (single)',
  VALUE_BULK_VARIETY: 'Bulk (variety)',
  SEASONAL_LIMITED: 'Seasonal',
  PAIRING_FUNCTIONAL: 'Pairing',
  RETAIL_COUNTER_DISPLAY: 'Retail display',
  REFILL_ECO: 'Refill / eco',
}

export default async function ProductTemplateDetail({
  params,
}: {
  params: Promise<{ templateSlug: string }>
}) {
  const user = await requireUser()

  const template = await prisma.productTemplate.findUnique({
    where: { slug: (await params).templateSlug },
    include: {
      subcategory: { include: { category: true } },
      manufacturerService: { include: { partner: true } },
      ingredientSlots: {
        include: {
          baseIngredient: true,
          replacements: { include: { ingredient: true }, orderBy: { displayOrder: 'asc' } },
        },
        orderBy: { displayOrder: 'asc' },
      },
      optionalIngredients: {
        include: { ingredient: true },
        orderBy: { displayOrder: 'asc' },
      },
      variants: { where: { isActive: true }, include: { dieCutTemplate: true } },
    },
  })

  if (!template || template.status !== 'PUBLISHED') notFound()

  const canCustomize = user.role === 'CREATOR' || user.role === 'ADMIN'
  const totalSlotIngredients = template.ingredientSlots.length
  const totalReplacementOptions = template.ingredientSlots.reduce(
    (sum, slot) => sum + slot.replacements.length,
    0,
  )

  return (
    <div className="space-y-6">
      {/* Breadcrumb + heading */}
      <div>
        <nav className="mb-2 text-xs text-zinc-500">
          <Link href="/marketplace" className="hover:underline">Marketplace</Link>
          {' › '}
          <Link
            href={`/marketplace?category=${template.subcategory.category.slug}`}
            className="hover:underline"
          >
            {template.subcategory.category.icon} {template.subcategory.category.name}
          </Link>
          {' › '}
          <Link
            href={`/marketplace?subcategory=${template.subcategory.slug}`}
            className="hover:underline"
          >
            {template.subcategory.name}
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
        {template.description && (
          <p className="mt-2 text-sm text-zinc-700">{template.description}</p>
        )}
        <p className="mt-1 text-xs text-zinc-500">
          By <Factory className="mr-1 inline h-3 w-3" />
          {template.manufacturerService?.partner.companyName ?? 'iLaunchify Platform'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" />
                Base recipe ({totalSlotIngredients} ingredients, {totalReplacementOptions} swap options)
              </CardTitle>
              <CardDescription>
                These are the manufacturer&apos;s default formulation slots. Each slot can be kept
                as-is or swapped for an alternative listed below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {template.ingredientSlots.map((slot) => (
                <div key={slot.id} className="rounded-md border border-zinc-200 p-3">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-medium">
                        {slot.label ?? slot.baseIngredient.name}{' '}
                        <span className="text-xs font-normal text-zinc-500">
                          ({Number(slot.weightG)}g)
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500">
                        Default: {slot.baseIngredient.name}
                      </div>
                    </div>
                    {slot.allowReplacement ? (
                      <span className="text-xs text-green-700">
                        {slot.replacements.length > 0
                          ? `${slot.replacements.length} swap${slot.replacements.length === 1 ? '' : 's'} available`
                          : 'Replaceable (no alternatives yet)'}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Locked</span>
                    )}
                  </div>
                  {slot.description && (
                    <p className="mt-2 text-xs text-zinc-600">{slot.description}</p>
                  )}
                  {slot.replacements.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {slot.replacements.map((r) => (
                        <li key={r.id} className="flex items-start gap-2 text-zinc-700">
                          <span className="text-zinc-400">↳</span>
                          <span>
                            <span className="font-medium">{r.ingredient.name}</span>
                            {r.calloutText && (
                              <span className="ml-1 text-zinc-500">— {r.calloutText}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {template.optionalIngredients.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-4 w-4" />
                  Optional add-ons ({template.optionalIngredients.length})
                </CardTitle>
                <CardDescription>Toggle these on during customization to differentiate your product.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {template.optionalIngredients.map((opt) => (
                    <li
                      key={opt.id}
                      className="flex items-start gap-2 rounded-md border border-zinc-200 p-2 text-sm"
                    >
                      <span className="font-medium">{opt.ingredient.name}</span>
                      <span className="text-xs text-zinc-500">+{Number(opt.weightG)}g</span>
                      {opt.calloutText && (
                        <span className="ml-auto text-xs text-zinc-600">{opt.calloutText}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4" />
                Available variants ({template.variants.length})
              </CardTitle>
              <CardDescription>
                Each variant is a different SKU — flavor, container, and packing topology.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {template.variants.map((v) => (
                <div
                  key={v.id}
                  className="grid grid-cols-1 gap-1 rounded-md border border-zinc-200 p-3 text-sm sm:grid-cols-[1fr,auto] sm:items-baseline"
                >
                  <div>
                    <div className="font-medium">
                      {v.flavor ? `${v.flavor} · ` : ''}
                      {v.containerFormat}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs text-zinc-600">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5">
                        {PACKING_LABELS[v.packingType] ?? v.packingType}
                      </span>
                      {v.innerPacksPerOuter > 1 && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5">
                          {v.innerPacksPerOuter}-count
                        </span>
                      )}
                      {v.customerPicksCount && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                          Consumer picks {v.customerPicksCount}
                        </span>
                      )}
                      {v.subscriptionInterval && (
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">
                          {v.subscriptionInterval}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    MOQ {v.moqMin.toLocaleString()}–{v.moqMax.toLocaleString()}
                    <br />
                    Lead {v.leadTimeDays}d
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price floor</CardTitle>
              <CardDescription>Lowest you can list this product at.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${(template.priceFloorCents / 100).toFixed(2)}</div>
              <p className="mt-2 text-xs text-zinc-500">
                Per-unit. Your selling price must be at least this.
              </p>
            </CardContent>
          </Card>

          {canCustomize ? (
            <Button asChild className="w-full" size="lg">
              <Link href={`/products/new?templateId=${template.id}`}>
                Customize this product →
              </Link>
            </Button>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Partner view</CardTitle>
                <CardDescription>
                  Only creators can customize products. Partners list catalog items via your own
                  product builder (V1.1+).
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}
