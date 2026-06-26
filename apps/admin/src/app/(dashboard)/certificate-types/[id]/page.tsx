// Admin — edit a CertificateType (name/description/notes + thumbnail + status).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { ArrowLeft, Palette } from 'lucide-react'
import { CertificateTypeForm } from '../CertificateTypeForm'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditCertificateTypePage({ params }: PageProps) {
  const { id } = await params
  const ct = await prisma.certificateType.findUnique({
    where: { id },
    include: {
      _count: { select: { partnerInstances: true } },
      alternativeOf: { select: { name: true } },
    },
  })
  if (!ct) notFound()

  // Resolve preview URLs for both badges so the admin can see what they uploaded.
  const badgeUrls = await resolveCertBadgeUrls([ct.thumbnailFileId, ct.badgeSvgFileId])
  const pngUrl = ct.thumbnailFileId ? (badgeUrls.get(ct.thumbnailFileId) ?? null) : null
  const svgUrl = ct.badgeSvgFileId ? (badgeUrls.get(ct.badgeSvgFileId) ?? null) : null

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/certificate-types"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to library
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{ct.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-500">
            {ct._count.partnerInstances.toLocaleString()} partner instance
            {ct._count.partnerInstances === 1 ? '' : 's'}
          </p>
          <Link
            href={`/certificate-types/${ct.id}/variants`}
            className="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-3 py-1 text-xs font-medium text-success-700 hover:bg-success-100"
          >
            <Palette className="h-3.5 w-3.5" /> Brand assets &amp; variants →
          </Link>
        </div>
      </header>

      <CertificateTypeForm
        mode="edit"
        typeId={ct.id}
        initial={{
          name: ct.name,
          slug: ct.slug,
          description: ct.description,
          verificationNotes: ct.verificationNotes ?? '',
          status: ct.status,
          hasThumbnail: !!ct.thumbnailFileId,
          hasSvgBadge: !!ct.badgeSvgFileId,
          pngUrl,
          svgUrl,
          scope: ct.scope,
          issuingBodyUrl: ct.issuingBodyUrl,
          applicabilityNotes: ct.applicabilityNotes,
          applicableLabelingTypes: ct.applicableLabelingTypes,
          applicableCategorySlugs: ct.applicableCategorySlugs,
          applicableMarketSlugs: ct.applicableMarketSlugs,
          claimCategories: ct.claimCategories,
          alternativeOfName: ct.alternativeOf?.name ?? null,
        }}
      />
    </div>
  )
}
