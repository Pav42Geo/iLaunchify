// Slice C8 — Partner packaging-offerings list. Every (container × decoration)
// combo the partner offers, scoped to their own PartnerService ids, grouped by
// status. Matches the partner-app packaging surface style (NOT admin v2).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { KpiWidget, cn } from '@ilaunchify/ui'
import { Plus, Layers, Clock3, CheckCircle2, Archive, ArrowLeft } from 'lucide-react'
import { loadOfferingsContext } from './data'
import {
  decorationLabel,
  fulfillmentLabel,
  firstTierPriceLabel,
} from './constants'
import { OfferingRowActions } from './OfferingRowActions'
import { rolePrefix } from '@/lib/role-skins'
import { PageTabs } from '@/components/PageTabs'

// v2 status pills — semantic tones (replaces legacy ring badges on this surface)
const OFFERING_STATUS_PILL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
  PENDING_REVIEW: { label: 'Pending review', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
  ACTIVE: { label: 'Active', cls: 'border-success-200 bg-success-50 text-success-800' },
  ARCHIVED: { label: 'Archived', cls: 'border-danger-200 bg-danger-50 text-danger-800' },
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packaging offerings — iLaunchify Partners' }

export default async function OfferingsListPage() {
  const ctx = await loadOfferingsContext()
  if (!ctx) return null

  // Role-aware framing: the offerings surface is shared by manufacturers and
  // co-packers (both attach packaging offerings), so the eyebrow + intro reflect
  // whichever the partner actually is instead of always saying "Manufacturing".
  const roleWord = rolePrefix(ctx.serviceTypes)
  const isManufacturer = ctx.serviceTypes.includes('MANUFACTURING')
  const introLead = isManufacturer
    ? 'The container-and-decoration combos you can produce'
    : 'The container-and-decoration combos you can pack'

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
      <PageTabs group="packaging" />
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/packaging"
              className="mb-2 inline-flex items-center gap-1 text-[12px] text-ink-500 transition-colors hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Packaging catalog
            </Link>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              {roleWord} · Packaging
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Decoration offerings
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
              {introLead}, with MOQ, pricing tiers, lead time, and fulfillment mode. Active
              offerings are selectable by creators when they build a product.
            </p>
          </div>
          {ctx.services.length > 0 && (
            <Link
              href="/packaging/offerings/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add offering
            </Link>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiWidget label="Total" value={total} icon={Layers} tone="ink" span={1} />
          <KpiWidget label="Drafts" value={drafts} icon={Layers} tone="ink" span={1} />
          <KpiWidget label="Pending review" value={pending} icon={Clock3} tone="warning" span={1} />
          <KpiWidget label="Active" value={active} icon={CheckCircle2} tone="success" span={1} />
          <KpiWidget label="Archived" value={archived} icon={Archive} tone="ink" span={1} />
        </div>
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
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-5 py-2.5 font-semibold">Container</th>
                  <th className="px-3 py-2.5 font-semibold">Decoration</th>
                  <th className="px-3 py-2.5 font-semibold">MOQ</th>
                  <th className="px-3 py-2.5 font-semibold">Lead</th>
                  <th className="px-3 py-2.5 font-semibold">From</th>
                  <th className="px-3 py-2.5 font-semibold">Fulfillment</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {offerings.map((o) => {
                  const pill =
                    OFFERING_STATUS_PILL[o.status] ?? {
                      label: o.status,
                      cls: 'border-ink-200 bg-ink-100 text-ink-700',
                    }
                  const containerName = o.packagingType.displayName
                  const decoration = decorationLabel(o.decorationMethod)
                  return (
                    <tr key={o.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                      <td className="px-5 py-3">
                        <Link
                          href={`/packaging/offerings/${o.id}`}
                          className="rounded font-medium text-ink-900 transition-colors hover:text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                        >
                          {containerName}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-ink-700">{decoration}</td>
                      <td className="px-3 py-3 tabular-nums text-ink-700">{o.moq.toLocaleString()}</td>
                      <td className="px-3 py-3 tabular-nums text-ink-700">{o.leadTimeDays}d</td>
                      <td className="px-3 py-3 tabular-nums text-ink-700">{firstTierPriceLabel(o.pricingTiers)}</td>
                      <td className="px-3 py-3 text-ink-700">{fulfillmentLabel(o.fulfillmentMode)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                            pill.cls,
                          )}
                        >
                          {pill.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
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
        </section>
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
    <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
        <Layers className="h-6 w-6 text-pink-700" aria-hidden="true" />
      </div>
      <p className="mx-auto mt-3 max-w-md text-[13px] text-ink-600">{message}</p>
      <Link
        href={ctaHref}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> {ctaLabel}
      </Link>
    </section>
  )
}
