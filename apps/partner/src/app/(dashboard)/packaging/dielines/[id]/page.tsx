// Slice C9 Phase 1 — edit one packaging dieline. Type + decoration are locked;
// the partner tunes dimensions, surface name, and can replace the source file.
// Ownership: the row is fetched scoped to the partner's own service ids.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { ArrowLeft } from 'lucide-react'
import { loadDielinesContext } from '../data'
import { DielineForm } from '../DielineForm'
import { DIELINE_STATUS_LABELS } from '../constants'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit dieline — iLaunchify Partners' }

export default async function EditDielinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await loadDielinesContext()
  if (!ctx) return null

  const dieline = await prisma.packagingDieline.findFirst({
    where: { id, partnerServiceId: { in: ctx.serviceIds } },
    include: {
      packagingType: { select: { displayName: true } },
      partnerFile: { select: { originalFilename: true } },
    },
  })
  if (!dieline) notFound()

  const surfaces = Array.isArray(dieline.surfaces)
    ? (dieline.surfaces as Array<{ name?: string }>)
    : []
  const surfaceName = surfaces[0]?.name ?? null
  const badge = DIELINE_STATUS_LABELS[dieline.status]

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/packaging/dielines"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dielines
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-ui-title">
            {dieline.packagingType.displayName}
          </h1>
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
        <p className="mt-1 text-ui-body text-ink-500">
          Container type and decoration are fixed for this dieline — adjust dimensions, surface
          name, and replace the source file below. Confirm / activate from the dielines list.
        </p>
      </header>

      <DielineForm
        mode="edit"
        dielineId={dieline.id}
        services={ctx.services}
        packagingTypes={ctx.packagingTypes}
        initial={{
          partnerServiceId: dieline.partnerServiceId,
          packagingTypeId: dieline.packagingTypeId,
          decorationMethod: dieline.decorationMethod,
          widthMm: dieline.widthMm !== null ? Number(dieline.widthMm) : null,
          heightMm: dieline.heightMm !== null ? Number(dieline.heightMm) : null,
          depthMm: dieline.depthMm !== null ? Number(dieline.depthMm) : null,
          bleedMm: Number(dieline.bleedMm),
          surfaceName,
          status: dieline.status,
          originalFilename: dieline.partnerFile?.originalFilename ?? null,
        }}
      />
    </div>
  )
}
