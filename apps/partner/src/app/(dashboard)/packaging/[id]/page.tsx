// Packaging system — edit page.
// Top: core fields form (PackagingForm in 'edit' mode)
// Middle: surfaces CRUD (SurfacesPanel)
// Bottom: status toggle (DRAFT -> ACTIVE -> RETIRED).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent } from '@ilaunchify/ui'
import { PackagingForm } from '../PackagingForm'
import { SurfacesPanel, type SurfaceRow } from '../SurfacesPanel'
import { PackagingStatusToggle } from './PackagingStatusToggle'
import { STATUS_LABELS } from '../constants'

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

  const statusBadge = STATUS_LABELS[system.status] ?? {
    label: system.status,
    cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/packaging"
            className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to catalog
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{system.partnerName}</h1>
          <span
            className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${statusBadge.cls}`}
          >
            {statusBadge.label}
          </span>
        </div>
        <PackagingStatusToggle
          packagingSystemId={system.id}
          currentStatus={system.status}
          hasSurfaces={system.surfaces.length > 0}
        />
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Core fields
        </h2>
        <PackagingForm mode="edit" packagingSystemId={system.id} initial={initial} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Surfaces
        </h2>
        <Card>
          <CardContent className="pt-6">
            <SurfacesPanel packagingSystemId={system.id} initialSurfaces={initialSurfaces} />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
