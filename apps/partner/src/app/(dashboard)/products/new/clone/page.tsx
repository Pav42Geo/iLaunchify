// Clone picker — copy one of the partner's own ProductTemplate rows into
// a fresh DRAFT. Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.1a + #134.
//
// Best for line extensions: same recipe, different flavor or container.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft, Copy } from 'lucide-react'
import { Card, CardContent, CardDescription } from '@ilaunchify/ui'
import { TemplatePicker } from '../TemplatePicker'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Clone a template — iLaunchify Partners' }

export default async function ClonePickerPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: { where: { type: 'MANUFACTURING' }, select: { id: true } } },
  })
  if (!partner) return null
  const serviceIds = partner.services.map((s) => s.id)

  const templates = serviceIds.length
    ? await prisma.productTemplate.findMany({
        where: {
          manufacturerServiceId: { in: serviceIds },
          status: { in: ['DRAFT', 'PUBLISHED', 'PENDING_REVIEW', 'PAUSED', 'NEEDS_CHANGES'] },
        },
        include: {
          subcategory: { select: { name: true, category: { select: { name: true } } } },
          _count: { select: { ingredientSlots: true, variants: true } },
        },
        orderBy: { updatedAt: 'desc' },
      })
    : []

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/products/new"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to start options
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          <Copy className="-mt-1 mr-1 inline h-5 w-5 text-emerald-600" />
          Clone one of your templates
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Best for line extensions — clones inherit ingredients + variants + custom meta,
          but you&apos;ll pick fresh packaging + certifications for the new SKU.
        </p>
      </header>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-500">
            <CardDescription>
              You don&apos;t have any templates to clone yet. Start with a{' '}
              <Link href="/products/new/blank" className="text-emerald-700 underline">
                blank product
              </Link>{' '}
              or an{' '}
              <Link href="/products/new/starter" className="text-emerald-700 underline">
                iLaunchify starter
              </Link>
              .
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <TemplatePicker
          source="OWN"
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            categoryName: t.subcategory.category.name,
            subcategoryName: t.subcategory.name,
            ingredientCount: t._count.ingredientSlots,
            variantCount: t._count.variants,
            statusBadge: t.status,
          }))}
        />
      )}
    </div>
  )
}
