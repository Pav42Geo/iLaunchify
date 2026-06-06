// Starter picker — clone an admin-curated iLaunchify starter template.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.1a + #134.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { TemplatePicker } from '../TemplatePicker'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Starter templates — iLaunchify Partners' }

export default async function StarterPickerPage() {
  // Auth + role check (cloning is partner-only)
  await requireUser()

  const starters = await prisma.productTemplate.findMany({
    where: {
      slug: { startsWith: 'starter-' },
      manufacturerServiceId: null,
    },
    include: {
      subcategory: { select: { name: true, category: { select: { name: true } } } },
      _count: { select: { ingredientSlots: true, variants: true } },
    },
    orderBy: { name: 'asc' },
  })

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
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Manufacturing · New product · Starter
        </p>
        <h1 className="mt-1 font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          iLaunchify starter templates
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Pick one to clone as your draft. Comes pre-loaded with example slots + a default
          variant. You&apos;ll add your own packaging + certifications after cloning.
        </p>
      </div>

      {starters.length === 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-white py-10 text-center text-[13px] text-ink-500">
          No starters seeded yet. Ask admin to run{' '}
          <code className="rounded bg-ink-100 px-1 text-[12px]">pnpm seed:starter-templates</code>.
        </div>
      ) : (
        <TemplatePicker
          source="STARTER"
          templates={starters.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            categoryName: t.subcategory.category.name,
            subcategoryName: t.subcategory.name,
            ingredientCount: t._count.ingredientSlots,
            variantCount: t._count.variants,
          }))}
        />
      )}
    </div>
  )
}
