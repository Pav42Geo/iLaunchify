// Starter picker — clone an admin-curated iLaunchify starter template.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.1a + #134.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription } from '@ilaunchify/ui'
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
      <header>
        <Link
          href="/products/new"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to start options
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          <Sparkles className="-mt-1 mr-1 inline h-5 w-5 text-emerald-600" />
          iLaunchify starter templates
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick one to clone as your draft. Comes pre-loaded with example slots + a default
          variant. You&apos;ll add your own packaging + certifications after cloning.
        </p>
      </header>

      {starters.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-500">
            <CardDescription>
              No starters seeded yet. Ask admin to run{' '}
              <code className="rounded bg-zinc-100 px-1 text-xs">pnpm seed:starter-templates</code>.
            </CardDescription>
          </CardContent>
        </Card>
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
