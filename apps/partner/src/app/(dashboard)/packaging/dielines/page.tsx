// Slice C9 Phase 1 — Partner packaging-dielines list. Every dieline the partner
// owns (file + structured spec), scoped to their own PartnerService ids, badged
// by status. Matches the partner-app packaging surface style (NOT admin v2).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { KpiWidget, cn } from '@ilaunchify/ui'
import { Plus, FileBox, Clock3, CheckCircle2, Archive, ArrowLeft } from 'lucide-react'
import { loadDielinesContext } from './data'
import { decorationLabel } from '../offerings/constants'
import { DielineRowActions } from './DielineRowActions'

// v2 status pills — semantic tones (replaces legacy ring badges on this surface)
const DIELINE_STATUS_PILL: Record<string, { label: string; cls: string }> = {
  UPLOADED: { label: 'Uploaded', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  PARSED: { label: 'Parsed', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  PARTNER_CONFIRMED: { label: 'Confirmed', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  ADMIN_VERIFIED: { label: 'Admin verified', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  ACTIVE: { label: 'Active', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  ARCHIVED: { label: 'Archived', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packaging dielines — iLaunchify Partners' }

export default async function DielinesListPage() {
  const ctx = await loadDielinesContext()
  if (!ctx) return null

  const dielines = await prisma.packagingDieline.findMany({
    where: { partnerServiceId: { in: ctx.serviceIds } },
    include: {
      packagingType: { select: { displayName: true } },
      _count: { select: { offerings: true } },
    },
    orderBy: [{ status: 'asc' }, { uploadedAt: 'desc' }],
  })

  const total = dielines.length
  const uploaded = dielines.filter((d) => d.status === 'UPLOADED' || d.status === 'PARSED').length
  const confirmed = dielines.filter((d) => d.status === 'PARTNER_CONFIRMED').length
  const active = dielines.filter((d) => d.status === 'ACTIVE').length
  const archived = dielines.filter((d) => d.status === 'ARCHIVED').length

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/packaging"
              className="mb-2 inline-flex items-center gap-1 text-[12px] text-ink-500 transition-colors hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Packaging catalog
            </Link>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              Manufacturing · Packaging
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Dielines
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
              Your prepress source files and their structured dimensional specs, per container and
              decoration method. Active and confirmed dielines can be attached to an offering so
              creators print to the right cut.
            </p>
          </div>
          {ctx.services.length > 0 && (
            <Link
              href="/packaging/dielines/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add dieline
            </Link>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiWidget label="Total" value={total} icon={FileBox} tone="ink" />
          <KpiWidget label="Uploaded" value={uploaded} icon={Clock3} tone="warning" />
          <KpiWidget label="Confirmed" value={confirmed} icon={CheckCircle2} tone="ink" />
          <KpiWidget label="Active" value={active} icon={CheckCircle2} tone="success" />
          <KpiWidget label="Archived" value={archived} icon={Archive} tone="ink" />
        </div>
      </div>

      {ctx.services.length === 0 ? (
        <EmptyState
          message="Add a service before uploading dielines — they attach to one of your services."
          ctaHref="/services"
          ctaLabel="Go to services"
        />
      ) : dielines.length === 0 ? (
        <EmptyState
          message="No dielines yet. Upload an AI / PDF / SVG / DXF source file and enter its dimensions so it's ready to attach to an offering."
          ctaHref="/packaging/dielines/new"
          ctaLabel="Add your first dieline"
        />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-5 py-2.5 font-semibold">Container</th>
                  <th className="px-3 py-2.5 font-semibold">Decoration</th>
                  <th className="px-3 py-2.5 font-semibold">Size (mm)</th>
                  <th className="px-3 py-2.5 font-semibold">Format</th>
                  <th className="px-3 py-2.5 font-semibold">Offerings</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {dielines.map((d) => {
                  const pill =
                    DIELINE_STATUS_PILL[d.status] ?? {
                      label: d.status,
                      cls: 'border-ink-200 bg-ink-100 text-ink-700',
                    }
                  const containerName = d.packagingType.displayName
                  const decoration = decorationLabel(d.decorationMethod)
                  const size =
                    d.widthMm !== null && d.heightMm !== null
                      ? `${Number(d.widthMm)} × ${Number(d.heightMm)}${d.depthMm !== null ? ` × ${Number(d.depthMm)}` : ''}`
                      : '—'
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/packaging/dielines/${d.id}`}
                          className="rounded font-medium text-ink-900 transition-colors hover:text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                        >
                          {containerName}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-ink-700">{decoration}</td>
                      <td className="px-3 py-3 tabular-nums text-ink-700">{size}</td>
                      <td className="px-3 py-3 text-ink-700">{d.originalFileFormat ?? '—'}</td>
                      <td className="px-3 py-3 tabular-nums text-ink-700">{d._count.offerings}</td>
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
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/dielines/${d.id}`}
                            className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1 text-[11.5px] font-semibold text-ink-800 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                          >
                            Open Studio
                          </Link>
                          <DielineRowActions
                            id={d.id}
                            label={`${containerName} · ${decoration}`}
                            status={d.status}
                          />
                        </div>
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
        <FileBox className="h-6 w-6 text-pink-700" aria-hidden="true" />
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
