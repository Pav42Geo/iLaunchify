// Adaptive Fulfillment Engine (AFE) — per-product fulfillment preference override.
// Overrides the creator's account-wide default (Settings → Fulfillment) for THIS
// product only. docs/FC_SELECTION_STRATEGY_BRIEF_2026-07-09.md.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ProductFulfillmentForm } from './ProductFulfillmentForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fulfillment preference — iLaunchify' }

export default async function ProductFulfillmentPage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId } = await params
  const user = await requireUser()

  const [product, profile] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
      select: { id: true, name: true, fulfillmentPreferenceOverride: true },
    }),
    prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: { fulfillmentPreference: true },
    }),
  ])
  if (!product) notFound()

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <Link
          href="/products"
          className="mb-2 inline-flex items-center gap-1 text-[12px] text-ink-500 transition-colors hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Products
        </Link>
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Product · Fulfillment
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          {product.name}
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          When a bulk order for this product ships to a fulfillment center, we auto-pick the
          best-matched one. Override what to optimize for on this product, or leave it on your
          account default (Settings → Fulfillment).
        </p>
      </div>

      <ProductFulfillmentForm
        productId={product.id}
        initialOverride={product.fulfillmentPreferenceOverride}
        accountDefault={profile?.fulfillmentPreference ?? 'BALANCED'}
      />
    </div>
  )
}
