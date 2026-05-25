// New product — Start-from picker (Blank / Clone / Starter).
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.1a + #134.
//
// Three cards:
//   Blank   → /products/new/blank — 4-step stepper from zero
//   Clone   → /products/new/clone — picker over partner's own DRAFT/PUBLISHED
//   Starter → /products/new/starter — picker over iLaunchify's curated catalog
//
// The deeper authoring (allergens, media, etc.) always happens on
// /products/[id]/edit regardless of starting choice.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft, ArrowRight, Copy, FileText, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New product — iLaunchify Partners' }

export default async function NewProductChooser() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: { where: { type: 'MANUFACTURING' }, select: { id: true } },
    },
  })
  if (!partner) return null

  const serviceIds = partner.services.map((s) => s.id)

  // Counts feed the card descriptions
  const [ownCount, starterCount] = await Promise.all([
    serviceIds.length
      ? prisma.productTemplate.count({
          where: { manufacturerServiceId: { in: serviceIds } },
        })
      : Promise.resolve(0),
    prisma.productTemplate.count({
      where: { slug: { startsWith: 'starter-' }, manufacturerServiceId: null },
    }),
  ])

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/products"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to products
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">How do you want to start?</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Three ways to begin. Whichever you pick, you can fully edit the draft afterward.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StartCard
          href="/products/new/blank"
          icon={FileText}
          title="Blank"
          description="Build a product from scratch with the 4-step stepper. Best for unique recipes."
          ctaLabel="Start blank"
          available
        />
        <StartCard
          href="/products/new/clone"
          icon={Copy}
          title="Clone an existing product"
          description={
            ownCount > 0
              ? `Copy from one of your ${ownCount} existing template${ownCount === 1 ? '' : 's'}. Best for line extensions (new flavor, new size).`
              : 'Copy from one of your own templates. Available once you have at least one product.'
          }
          ctaLabel={ownCount > 0 ? 'Pick from yours' : 'No templates yet'}
          available={ownCount > 0}
        />
        <StartCard
          href="/products/new/starter"
          icon={Sparkles}
          title="iLaunchify starter"
          description={
            starterCount > 0
              ? `Start from one of our ${starterCount} curated starters (whey protein, hot sauce, gummies, …). Pre-loaded with FDA-friendly defaults.`
              : 'Starters not seeded yet. Ask admin to run pnpm seed:starter-templates.'
          }
          ctaLabel={starterCount > 0 ? 'Browse starters' : 'Unavailable'}
          available={starterCount > 0}
        />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Card primitive
// -----------------------------------------------------------------------------

function StartCard({
  href,
  icon: Icon,
  title,
  description,
  ctaLabel,
  available,
}: {
  href: string
  icon: typeof FileText
  title: string
  description: string
  ctaLabel: string
  available: boolean
}) {
  const content = (
    <Card
      className={`flex h-full flex-col transition-colors ${
        available ? 'hover:border-emerald-300 hover:bg-emerald-50/30' : 'opacity-60'
      }`}
    >
      <CardHeader>
        <div
          className={`mb-2 flex h-10 w-10 items-center justify-center rounded-md ${
            available ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex items-center justify-between text-sm">
        <span
          className={`font-medium ${
            available ? 'text-emerald-700' : 'text-zinc-400'
          }`}
        >
          {ctaLabel}
        </span>
        {available && <ArrowRight className="h-4 w-4 text-emerald-700" />}
      </CardContent>
    </Card>
  )

  if (!available) return <div>{content}</div>
  return <Link href={href}>{content}</Link>
}
