// Slice C9 Phase 1 — Partner packaging-dielines list. Every dieline the partner
// owns (file + structured spec), scoped to their own PartnerService ids, badged
// by status. Matches the partner-app packaging surface style (NOT admin v2).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { Button, KpiWidget } from '@ilaunchify/ui'
import { Plus, FileBox, Clock3, CheckCircle2, Archive, ArrowLeft } from 'lucide-react'
import type { DielineStatus } from '@ilaunchify/db'
import { loadDielinesContext } from './data'
import { DIELINE_STATUS_LABELS } from './constants'
import { decorationLabel } from '../offerings/constants'
import { DielineRowActions } from './DielineRowActions'

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
      <header className="space-y-1">
        <Link
          href="/packaging"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Packaging catalog
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dielines</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Your prepress source files and their structured dimensional specs, per container and
              decoration method. Active and confirmed dielines can be attached to an offering so
              creators print to the right cut.
            </p>
          </div>
          {ctx.services.length > 0 && (
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
              <Link href="/packaging/dielines/new">
                <Plus className="mr-1.5 h-4 w-4" /> Add dieline
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiWidget label="Total" value={total} icon={FileBox} tone="ink" />
        <KpiWidget label="Uploaded" value={uploaded} icon={Clock3} tone="warning" />
        <KpiWidget label="Confirmed" value={confirmed} icon={CheckCircle2} tone="ink" />
        <KpiWidget label="Active" value={active} icon={CheckCircle2} tone="success" />
        <KpiWidget label="Archived" value={archived} icon={Archive} tone="ink" />
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
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-2.5 font-semibold">Container</th>
                <th className="px-4 py-2.5 font-semibold">Decoration</th>
                <th className="px-4 py-2.5 font-semibold">Size (mm)</th>
                <th className="px-4 py-2.5 font-semibold">Format</th>
                <th className="px-4 py-2.5 font-semibold">Offerings</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {dielines.map((d) => {
                const badge =
                  DIELINE_STATUS_LABELS[d.status as DielineStatus] ?? {
                    label: d.status,
                    cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
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
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/packaging/dielines/${d.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {containerName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{decoration}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{size}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{d.originalFileFormat ?? '—'}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{d._count.offerings}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DielineRowActions
                        id={d.id}
                        label={`${containerName} · ${decoration}`}
                        status={d.status}
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
        <FileBox className="h-5 w-5 text-zinc-400" />
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
