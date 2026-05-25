// New product (blank) — 4-step stepper. Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.2.
// The /products/new chooser sends the partner here when they pick 'Blank'.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft } from 'lucide-react'
import { NewProductStepper } from '../NewProductStepper'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New product — Blank — iLaunchify Partners' }

export default async function NewProductBlankPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return null

  const [categories, subcategories, packagingSystems] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, name: true, mainCategory: true },
      orderBy: { name: 'asc' },
    }),
    prisma.subcategory.findMany({
      select: { id: true, name: true, categoryId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.packagingSystem.findMany({
      where: { partnerId: partner.id, status: 'ACTIVE' },
      select: { id: true, partnerName: true, topology: true, unitCount: true, moq: true },
      orderBy: { partnerName: 'asc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/products/new"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to start options
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Start blank</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Four quick steps to get a draft. The deeper editor (allergens, media, certificates)
          opens once the draft exists.
        </p>
      </header>

      {packagingSystems.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You need at least one <strong>Active</strong> packaging system before creating a
          product.{' '}
          <Link href="/packaging/new" className="font-medium underline">
            Add packaging
          </Link>{' '}
          first, then come back.
        </div>
      ) : (
        <NewProductStepper
          categories={categories}
          subcategories={subcategories}
          packagingSystems={packagingSystems}
        />
      )}
    </div>
  )
}
