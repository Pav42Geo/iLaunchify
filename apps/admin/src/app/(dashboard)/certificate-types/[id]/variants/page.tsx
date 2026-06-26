// Admin — brand-asset variants for a CertificateType (C7 asset library).
// Per-variant reproduction standards + SVG/PNG assets.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { ArrowLeft } from 'lucide-react'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'
import { CertVariantsManager } from './CertVariantsManager'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CertVariantsPage({ params }: PageProps) {
  const { id } = await params
  const ct = await prisma.certificateType.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      assetVariants: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!ct) notFound()

  // Resolve preview URLs for every variant's svg/png asset.
  const assetIds = ct.assetVariants.flatMap((v) => [v.svgFileId, v.pngFileId])
  const urls = await resolveCertBadgeUrls(assetIds)

  const variants = ct.assetVariants.map((v) => ({
    id: v.id,
    kind: v.kind,
    label: v.label,
    minWidthMm: v.minWidthMm,
    maxWidthMm: v.maxWidthMm,
    approvedColorSpec: v.approvedColorSpec,
    requiredCoText: v.requiredCoText,
    clearSpaceFactor: v.clearSpaceFactor,
    brandGuidelinesUrl: v.brandGuidelinesUrl,
    notes: v.notes,
    svgUrl: v.svgFileId ? (urls.get(v.svgFileId) ?? null) : null,
    pngUrl: v.pngFileId ? (urls.get(v.pngFileId) ?? null) : null,
    hasSvg: !!v.svgFileId,
    hasPng: !!v.pngFileId,
  }))

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/certificate-types/${ct.id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {ct.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{ct.name} — brand assets</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Approved mark variants (color / black &amp; white / outline / contextual lockups) with
          reproduction standards. The SVG is the production vector; the PNG is the UI preview.
        </p>
      </header>

      <CertVariantsManager certificateTypeId={ct.id} variants={variants} />
    </div>
  )
}
