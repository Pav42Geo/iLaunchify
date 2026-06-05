// Slice C8 — Partner packaging-offerings list. Every (container × decoration)
// combo the partner offers, scoped to their own PartnerService ids, grouped by
// status. Matches the partner-app packaging surface style (NOT admin v2).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { Button, KpiWidget } from '@ilaunchify/ui'
import { Plus, Layers, Clock3, CheckCircle2, Archive, ArrowLeft } from 'lucide-react'
import type { OfferingStatus } from '@ilaunchify/db'
import { loadOfferingsContext } from './data'
import {
  STATUS_LABELS,
  decorationLabel,
  fulfillmentLabel,
  firstTierPriceLabel,
} from './constants'
import { OfferingRowActions } from './OfferingRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packaging offerings — iLaunchify Partners' }

export default async function OfferingsListPage() {
  const ctx = await loadOfferingsContext()
  if (!ctx) return null

  const offerings = await prisma.partnerPackagingOffering.findMany({
    where: { partnerServiceId: { in: ctx.serviceIds } },
    include: { packagingType: { select: { displayName: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  const total = offerings.length
  const pending = offerings.filter((o) => o.status === 'PENDING_REVIEW').length
  const active = offerings.filter((o) => o.status === 'ACTIVE').length
  const archived = offerings.filter((o) => o.status === 'ARCHIVED').length
  const drafts = offerings.filter((o) => o.status === 'DRAFT').length

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/packaging"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Packaging catalog
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Decoration offerings</h1>
            <p className="mt-1 text-sm text-zinc-500">
              The container-and-decoration combos you can produce, with MOQ, pricing tiers, lead
              time, and fulfillment mode. Active offerings are selectable by creators when they
              build a product.
            </p>
          </div>
          {ctx.services.length > 0 && (
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
              <Link href="/packaging/offerings/new">
                <Plus className="mr-1.5 h-4 w-4" /> Add offering
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiWidget label="Total" value={total} icon={Layers} tone="ink" />
        <KpiWidget label="Drafts" value={drafts} icon={Layers} tone="ink" />
        <KpiWidget label="Pending review" value={pending} icon={Clock3} tone="warning" />
        <KpiWidget label="Active" value={active} icon={CheckCircle2} tone="success" />
        <KpiWidget label="Archived" value={archived} icon={Archive} tone="ink" />
      </div>

      {ctx.services.length === 0 ? (
        <EmptyState
          message="Add a service before listing offerings — they attach to one of your services."
          ctaHref="/services"
          ctaLabel="Go to services"
        />
      ) : offerings.length === 0 ? (
        <EmptyState
          message="No offerings yet. Declare a container type, a decoration method, and your pricing so creators can pick it."
          ctaHref="/packaging/offerings/new"
          ctaLabel="Add your first offering"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-2.5 font-semibold">Container</th>
                <th className="px-4 py-2.5 font-semibold">Decoration</th>
                <th className="px-4 py-2.5 font-semibold">MOQ</th>
                <th className="px-4 py-2.5 font-semibold">Lead</th>
                <th className="px-4 py-2.5 font-semibold">From</th>
                <th className="px-4 py-2.5 font-semibold">Fulfillment</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {offerings.map((o) => {
                const badge =
                  STATUS_LABELS[o.status as OfferingStatus] ?? {
                    label: o.status,
                    cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
                  }
                const containerName = o.packagingType.displayName
                const decoration = decorationLabel(o.decorationMethod)
                return (
                  <tr key={o.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/packaging/offerings/${o.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {containerName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{decoration}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{o.moq.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{o.leadTimeDays}d</td>
                    <td className="px-4 py-2.5 text-zinc-600">{firstTierPriceLabel(o.pricingTiers)}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{fulfillmentLabel(o.fulfillmentMode)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <OfferingRowActions
                        id={o.id}
                        label={`${containerName} · ${decoration}`}
                        status={o.status}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  message,
  ctaHref,
  ctaLabel,
}: {
  message: string
  ctaHref: string
  ctaLabel: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
        <Layers className="h-5 w-5 text-zinc-400" />
      </span>
      <p className="max-w-md text-sm text-zinc-500">{message}</p>
      <Button asChild variant="outline">
        <Link href={ctaHref}>
          <Plus className="mr-1.5 h-4 w-4" /> {ctaLabel}
        </Link>
      </Button>
    </div>
  )
}
