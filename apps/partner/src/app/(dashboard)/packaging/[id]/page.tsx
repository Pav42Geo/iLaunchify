// Packaging system — edit page.
// Top: core fields form (PackagingForm in 'edit' mode)
// Middle: surfaces CRUD (SurfacesPanel)
// Bottom: status toggle (DRAFT -> ACTIVE -> RETIRED).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { PackagingForm } from '../PackagingForm'
import { SurfacesPanel, type SurfaceRow } from '../SurfacesPanel'
import { PackagingStatusToggle } from './PackagingStatusToggle'

// v2 status pill — semantic tones
const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  DRAFT: { label: 'Draft', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
  RETIRED: { label: 'Retired', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
}

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PackagingEditPage({ params }: PageProps) {
  const { id } = await params
  const user = await requireUser()

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) notFound()

  const system = await prisma.packagingSystem.findUnique({
    where: { id },
    include: {
      surfaces: { orderBy: { id: 'asc' } },
    },
  })
  if (!system || system.partnerId !== partner.id) notFound()

  // Hydrate die-line filenames so the SurfacesPanel can show "✓ filename.pdf"
  const dieLineIds = system.surfaces
    .map((s) => s.dieLineFileId)
    .filter((id): id is string => !!id)
  const dieLineFiles = dieLineIds.length
    ? await prisma.partnerFile.findMany({
        where: { id: { in: dieLineIds } },
        select: { id: true, originalFilename: true },
      })
    : []
  const filenameById = new Map(dieLineFiles.map((f) => [f.id, f.originalFilename]))

  const initialSurfaces: SurfaceRow[] = system.surfaces.map((s) => ({
    id: s.id,
    name: s.name,
    printableAreaSqIn: s.printableAreaSqIn,
    bleedMm: s.bleedMm,
    printDpi: s.printDpi,
    colorMode: s.colorMode,
    dieLineFileId: s.dieLineFileId,
    dieLineFilename: s.dieLineFileId ? (filenameById.get(s.dieLineFileId) ?? null) : null,
  }))

  // Hydrate core form
  const dims = (system.dimensions ?? null) as
    | { lengthMm?: number | null; widthMm?: number | null; heightMm?: number | null }
    | null
  const initial = {
    partnerName: system.partnerName,
    topology: system.topology,
    unitCount: String(system.unitCount),
    flavorMode: system.flavorMode,
    flavorPolicy: system.flavorPolicy,
    moq: String(system.moq),
    lengthMm: dims?.lengthMm != null ? String(dims.lengthMm) : '',
    widthMm: dims?.widthMm != null ? String(dims.widthMm) : '',
    heightMm: dims?.heightMm != null ? String(dims.heightMm) : '',
    maxWeightG: system.maxWeightG != null ? String(system.maxWeightG) : '',
  }

  const statusPill = STATUS_PILL[system.status] ?? {
    label: system.status,
    cls: 'border-ink-200 bg-ink-100 text-ink-700',
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/packaging"
              className="mb-2 inline-flex items-center gap-1 text-[12px] text-ink-500 transition-colors hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to catalog
            </Link>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              Manufacturing · Packaging
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              {system.partnerName}
            </h1>
            <span
              className={cn(
                'mt-2 inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                statusPill.cls,
              )}
            >
              {statusPill.label}
            </span>
          </div>
          <PackagingStatusToggle
            packagingSystemId={system.id}
            currentStatus={system.status}
            hasSurfaces={system.surfaces.length > 0}
          />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-[14px] font-semibold tracking-tight text-ink-900">
          Core fields
        </h2>
        <PackagingForm mode="edit" packagingSystemId={system.id} initial={initial} />
      </section>

      <section className="space-y-3">
        <div className="rounded-2xl border border-ink-200 bg-white p-6">
          <SurfacesPanel packagingSystemId={system.id} initialSurfaces={initialSurfaces} />
        </div>
      </section>
    </div>
  )
}
