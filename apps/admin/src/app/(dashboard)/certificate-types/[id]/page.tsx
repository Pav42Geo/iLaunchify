// Admin — edit a CertificateType (name/description/notes + thumbnail + status).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { ArrowLeft } from 'lucide-react'
import { CertificateTypeForm } from '../CertificateTypeForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditCertificateTypePage({ params }: PageProps) {
  const { id } = await params
  const ct = await prisma.certificateType.findUnique({
    where: { id },
    include: { _count: { select: { partnerInstances: true } } },
  })
  if (!ct) notFound()

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/certificate-types"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to library
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{ct.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {ct._count.partnerInstances.toLocaleString()} partner instance
          {ct._count.partnerInstances === 1 ? '' : 's'}
        </p>
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
        }}
      />
    </div>
  )
}
