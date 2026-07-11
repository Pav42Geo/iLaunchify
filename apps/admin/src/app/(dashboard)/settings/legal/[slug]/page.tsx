import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { LegalDocumentDetail } from './LegalDocumentDetail'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return { title: `Legal · ${slug} — Admin` }
}

export default async function LegalDocumentDetailPage({ params }: Props) {
  await requireCapability('platform:admin')
  const { slug } = await params

  const doc = await prisma.legalDocument.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      audience: true,
      requiresAcceptance: true,
      reconsentIntervalDays: true,
      isActive: true,
      currentVersionId: true,
      versions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          version: true,
          status: true,
          changeType: true,
          bodyHtml: true,
          summaryOfChanges: true,
          contentSha256: true,
          effectiveAt: true,
          publishedAt: true,
          createdAt: true,
          files: {
            select: { id: true, format: true, fileName: true, sizeBytes: true, isPrimary: true, sha256: true },
          },
        },
      },
      acceptances: {
        orderBy: { acceptedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          userId: true,
          actorType: true,
          method: true,
          signerName: true,
          documentVersionId: true,
          recordSha256: true,
          acceptedAt: true,
        },
      },
    },
  })

  if (!doc) notFound()

  // Shape a fully-serializable payload for the client component.
  const payload = {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    kind: doc.kind,
    audience: doc.audience,
    requiresAcceptance: doc.requiresAcceptance,
    reconsentIntervalDays: doc.reconsentIntervalDays,
    isActive: doc.isActive,
    currentVersionId: doc.currentVersionId,
    versions: doc.versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status as string,
      changeType: (v.changeType as string | null) ?? null,
      bodyHtml: v.bodyHtml,
      summaryOfChanges: v.summaryOfChanges,
      contentSha256: v.contentSha256,
      effectiveAt: v.effectiveAt ? v.effectiveAt.toISOString() : null,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      createdAt: v.createdAt.toISOString(),
      files: v.files.map((f) => ({
        id: f.id,
        format: f.format as string,
        fileName: f.fileName,
        sizeBytes: f.sizeBytes,
        isPrimary: f.isPrimary,
        sha256: f.sha256,
      })),
    })),
    acceptances: doc.acceptances.map((a) => ({
      id: a.id,
      userId: a.userId,
      actorType: a.actorType as string,
      method: a.method,
      signerName: a.signerName,
      documentVersionId: a.documentVersionId,
      recordSha256: a.recordSha256,
      acceptedAt: a.acceptedAt.toISOString(),
    })),
  }

  return (
    <div className="space-y-6">
      <Link
        href="/settings/legal"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All legal documents
      </Link>

      <AdminPageHeader
        eyebrow={`Platform · Legal · ${doc.kind}`}
        title={doc.title}
        description={
          <span>
            <span className="font-mono text-ink-500">/{doc.slug}</span> · Draft-authoring workspace. Publishing arrives in the next phase — edits here stay in draft and do not change public pages.
          </span>
        }
      />

      <LegalDocumentDetail doc={payload} />
    </div>
  )
}
