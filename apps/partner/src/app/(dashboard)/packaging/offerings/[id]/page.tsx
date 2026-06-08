// Slice C8 — edit one packaging offering. Type + decoration are locked (unique
// key); the partner tunes MOQ / lead time / fulfillment / pricing / status here.
// Ownership: the row is fetched scoped to the partner's own service ids.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { ArrowLeft } from 'lucide-react'
import type { PricingTier } from '../constants'
import { loadOfferingsContext } from '../data'
import { OfferingForm } from '../OfferingForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit offering — iLaunchify Partners' }

export default async function EditOfferingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await loadOfferingsContext()
  if (!ctx) return null

  const offering = await prisma.partnerPackagingOffering.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    include: { packagingType: { select: { displayName: true } } },
  })
  if (!offering) notFound()

  const tiers = Array.isArray(offering.pricingTiers)
    ? (offering.pricingTiers as unknown as PricingTier[])
    : []

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/packaging/offerings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to offerings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {offering.packagingType.displayName}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Container type and decoration are fixed for this offering — adjust pricing, lead time,
          fulfillment, and status below.
        </p>
      </header>

      <OfferingForm
        mode="edit"
        offeringId={offering.id}
        services={ctx.services}
        packagingTypes={ctx.packagingTypes}
        dielines={ctx.dielines}
        initial={{
          partnerServiceId: offering.partnerServiceId,
          packagingTypeId: offering.packagingTypeId,
          decorationMethod: offering.decorationMethod,
          moq: offering.moq,
          leadTimeDays: offering.leadTimeDays,
          fulfillmentMode: offering.fulfillmentMode,
          status: offering.status,
          pricingTiers: tiers,
          dielineId: offering.dielineId,
        }}
      />
    </div>
  )
}
