// New product — Start-from picker (Blank / Clone / Starter).
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.1a + #134.
//
// Partner-v2 chrome (Pavel 2026-06-05) — matches the /products reference page:
// cream hero band, ink/pink tokens, black-pill affordances.
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
import { cn } from '@ilaunchify/ui'
import { ArrowLeft, ArrowRight, Copy, FileText, Sparkles } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New product — iLaunchify Partners' }

export default async function NewProductChooser() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: { where: { type: 'MANUFACTURING' }, select: { id: true } } },
  })
  if (!partner) return null

  const serviceIds = partner.services.map((s) => s.id)

  // Counts feed the card descriptions
  const [ownCount, starterCount] = await Promise.all([
    serviceIds.length
      ? prisma.productTemplate.count({ where: { manufacturerServiceId: { in: serviceIds } } })
      : Promise.resolve(0),
    prisma.productTemplate.count({
      where: { slug: { startsWith: 'starter-' }, manufacturerServiceId: null },
    }),
  ])

  return (
    <div className="space-y-6">
      {/* Hero — cream band (partner-v2 chrome) */}
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to products
        </Link>
        <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Manufacturing · New product
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          How do you want to start?
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Three ways to begin. Whichever you pick, you can fully edit the draft afterward — the
          4-step stepper only ever runs once per product.
        </p>
      </div>

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
// Card primitive — partner-v2 tokens
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
    <div
      className={cn(
        'flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-5 transition-all',
        available
          ? 'hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]'
          : 'opacity-60',
      )}
    >
      <div
        className={cn(
          'mb-3 flex h-10 w-10 items-center justify-center rounded-xl',
          available ? 'bg-pink-100 text-pink-700' : 'bg-zinc-100 text-zinc-500',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="font-display text-[16px] font-semibold text-ink-900">{title}</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">{description}</p>
      <div className="mt-auto flex items-center justify-between pt-4 text-[13px]">
        <span className={cn('font-semibold', available ? 'text-pink-700' : 'text-ink-400')}>
          {ctaLabel}
        </span>
        {available && (
          <ArrowRight className="h-4 w-4 text-pink-700 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        )}
      </div>
    </div>
  )

  if (!available) return <div>{content}</div>
  return (
    <Link
      href={href}
      className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  )
}
