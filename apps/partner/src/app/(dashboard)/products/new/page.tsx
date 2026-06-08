// New product — single turnkey flow (2026-06-07).
// Replaces the former Blank/Clone/Starter chooser. The partner lands straight
// in the guided flow: Basics → Recipe → Packaging → Pricing, which creates a
// DRAFT ProductTemplate (via createDraftFromStepper) and hands off to
// /products/[id]/edit for deep authoring (recipe builder, allergens, label,
// media, certificates).
//
// Partner-v2 chrome: cream hero band, ink/pink tokens, black-pill affordances.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft } from 'lucide-react'
import { TurnkeyProductFlow } from './TurnkeyProductFlow'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New product — iLaunchify Partners' }

// ServiceType → turnkey scope label for the hero chips.
const SERVICE_SCOPE: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Packing',
  LABEL_PRINTING: 'Printing',
  WAREHOUSE: 'Fulfillment',
}

export default async function NewProductPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, services: { select: { type: true } } },
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

  // Dedup + order the partner's turnkey service scope for the hero chips.
  const scopeOrder = ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE']
  const scopes = scopeOrder
    .filter((t) => partner.services.some((s) => s.type === t))
    .map((t) => SERVICE_SCOPE[t]!)

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
          Build a new product
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Four quick steps to a draft. The deeper recipe builder, allergens, label, and media open
          in the editor once the draft exists.
        </p>
        {scopes.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">
              Your services:
            </span>
            {scopes.map((label) => (
              <span
                key={label}
                className="rounded-full border border-[#F4C0D1] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-pink-700"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {packagingSystems.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          You need at least one <strong>Active</strong> packaging system before creating a product.{' '}
          <Link href="/packaging/new" className="font-medium underline">
            Add packaging
          </Link>{' '}
          first, then come back.
        </div>
      ) : (
        <TurnkeyProductFlow
          categories={categories}
          subcategories={subcategories}
          packagingSystems={packagingSystems}
        />
      )}
    </div>
  )
}
