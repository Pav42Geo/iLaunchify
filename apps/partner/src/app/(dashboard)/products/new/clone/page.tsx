// Clone picker — copy one of the partner's own ProductTemplate rows into
// a fresh DRAFT. Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.1a + #134.
//
// Best for line extensions: same recipe, different flavor or container.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft, Copy } from 'lucide-react'
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
      <div className="rounded-3xl border border-ink-200 bg-[#F3EFE8] px-6 py-5">
        <Link
          href="/products/new"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to start options
        </Link>
        <p className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Manufacturing · New product · Clone
        </p>
        <h1 className="mt-1 font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Clone one of your templates
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Best for line extensions — clones inherit ingredients + variants + custom meta,
          but you&apos;ll pick fresh packaging + certifications for the new SKU.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-white py-10 text-center text-[13px] text-ink-500">
          You don&apos;t have any templates to clone yet. Start with a{' '}
          <Link href="/products/new/blank" className="font-medium text-pink-700 underline">
            blank product
          </Link>{' '}
          or an{' '}
          <Link href="/products/new/starter" className="font-medium text-pink-700 underline">
            iLaunchify starter
          </Link>
          .
        </div>
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
