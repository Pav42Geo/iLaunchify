// Admin — edit a PackagingSymbol + manage its artwork variants (C7).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { ArrowLeft } from 'lucide-react'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'
import { PackagingSymbolForm } from '../PackagingSymbolForm'
import { PackagingVariantsManager } from '../PackagingVariantsManager'
import { StatusToggle } from '../StatusToggle'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditPackagingSymbolPage({ params }: PageProps) {
  const { id } = await params
  const sym = await prisma.packagingSymbol.findUnique({
    where: { id },
    include: { variants: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!sym) notFound()

  const assetIds = sym.variants.flatMap((v) => [v.svgFileId, v.pngFileId])
  const urls = await resolveCertBadgeUrls(assetIds)

  const variants = sym.variants.map((v) => ({
    id: v.id,
    label: v.label,
    minWidthMm: v.minWidthMm,
    maxWidthMm: v.maxWidthMm,
    approvedColorSpec: v.approvedColorSpec,
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/assets/packaging-symbols"
            className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to packaging symbols
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{sym.name}</h1>
        </div>
        <StatusToggle id={sym.id} status={sym.status} />
      </header>

      <PackagingSymbolForm
        initial={{
          id: sym.id,
          name: sym.name,
          slug: sym.slug,
          description: sym.description,
          family: sym.family,
          applicableSubstrates: sym.applicableSubstrates,
          applicableMaterials: sym.applicableMaterials,
          applicableMarkets: sym.applicableMarkets,
          requirement: sym.requirement,
          requiredWhen: sym.requiredWhen,
        }}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Artwork variants</h2>
        <PackagingVariantsManager packagingSymbolId={sym.id} variants={variants} />
      </section>
    </div>
  )
}
