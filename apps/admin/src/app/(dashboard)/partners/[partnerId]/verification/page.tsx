// Per-partner verification queue.
// Renders one review card per section (5-section model per #159 — adds
// OPERATIONAL_STANDARDS for the 5-layer onboarding rollout). Each card has
// a status picker + admin notes + file list. Phase 2 also surfaces
// read-only "context panels" above the BUSINESS, FACILITY, and
// OPERATIONAL_STANDARDS cards so admin can see WHAT they're verifying —
// not just metadata. Overall status is derived; activation/suspension
// remain explicit on the partner detail page.

import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ilaunchify/ui'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  ALL_SECTIONS,
  SECTION_LABEL,
  SECTION_DESCRIPTION,
  computeOverallStatus,
  statusBadgeClass,
} from '@/lib/verification'
import { SectionReview } from './SectionReview'
import {
  BusinessContext,
  CapabilitiesContext,
  CommercialContext,
} from './SectionContext'
import { CertificationsReview, type CertInstanceRow } from './CertificationsReview'
import type { PartnerFile, VerificationSectionType } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ partnerId: string }>
}

export default async function VerificationPage({ params }: PageProps) {
  const { partnerId } = await params

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      user: { select: { name: true, email: true, stripeAccountId: true, stripeAccountStatus: true } },
      verificationSections: {
        include: { verifiedBy: { select: { name: true, email: true } } },
      },
      files: { orderBy: { uploadedAt: 'desc' } },
      services: {
        select: { id: true, type: true, status: true, capabilities: true },
        orderBy: { type: 'asc' },
      },
      commercialTerms: {
        include: {
          contractTerms: {
            select: { version: true, name: true, status: true },
          },
        },
      },
      certificateInstances: {
        include: {
          certificateType: {
            select: { name: true, slug: true, description: true, verificationNotes: true },
          },
        },
        orderBy: [{ status: 'asc' }, { expiryDate: 'asc' }],
      },
    },
  })
  if (!partner) notFound()

  // Index sections + files by sectionType for fast lookup
  const sectionByType = new Map(partner.verificationSections.map((s) => [s.type, s]))
  const filesBySection = new Map<VerificationSectionType, PartnerFile[]>()
  for (const f of partner.files) {
    const list = filesBySection.get(f.sectionType) ?? []
    list.push(f)
    filesBySection.set(f.sectionType, list)
  }

  const overall = computeOverallStatus(partner.verificationSections)

  // Hydrate cert instances for the CertificationsReview block. PDF filenames
  // come from PartnerFile (separate lookup since the schema doesn't join).
  const pdfFileIds = partner.certificateInstances.map((c) => c.pdfFileId).filter(Boolean)
  const pdfFiles = pdfFileIds.length
    ? await prisma.partnerFile.findMany({
        where: { id: { in: pdfFileIds } },
        select: { id: true, originalFilename: true },
      })
    : []
  const pdfFilenameById = new Map(pdfFiles.map((f) => [f.id, f.originalFilename]))

  const certInstances: CertInstanceRow[] = partner.certificateInstances.map((c) => ({
    id: c.id,
    status: c.status,
    certificateNumber: c.certificateNumber,
    issuingBody: c.issuingBody,
    issueDate: c.issueDate,
    expiryDate: c.expiryDate,
    rejectionReason: c.rejectionReason,
    reviewedAt: c.reviewedAt,
    pdfFileName: pdfFilenameById.get(c.pdfFileId) ?? null,
    certificateType: c.certificateType,
  }))

  // Pull signer name from Partner.onboardingProgress JSON (set by
  // acceptStandardContract). Falls back to the User.name lookup below.
  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  const signerName =
    typeof progress.contractSignerName === 'string' ? progress.contractSignerName : ''

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/partners/${partnerId}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to partner
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Verify {partner.companyName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {partner.user.email} · Partner status:{' '}
          <span className="font-medium">{partner.status}</span>
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Overall verification</CardTitle>
            <CardDescription>
              Derived from the {ALL_SECTIONS.length} sections below. Activation remains a
              separate explicit step on the partner detail page.
            </CardDescription>
          </div>
          <span
            className={`rounded px-2 py-1 text-xs font-medium uppercase ${statusBadgeClass(overall)}`}
          >
            {overall.replace('_', ' ')}
          </span>
        </CardHeader>
        <CardContent>
          {overall === 'VERIFIED' && partner.status !== 'ACTIVE' && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
              All sections verified. You can now{' '}
              <Link href={`/partners/${partnerId}`} className="underline">
                activate this partner
              </Link>
              .
            </div>
          )}
          {overall === 'REJECTED' && partner.status === 'ACTIVE' && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              At least one section is REJECTED but the partner is ACTIVE — consider suspending
              from the partner detail page.
            </div>
          )}
          {overall === 'NEEDS_CHANGES' && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Partner has been asked to make changes. They&apos;ll see your notes on{' '}
              /onboarding/status and can resubmit by editing the relevant accordion section.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-8">
        {ALL_SECTIONS.map((type) => {
          const section = sectionByType.get(type)
          const files = filesBySection.get(type) ?? []
          const current = {
            status: section?.status ?? 'PENDING',
            adminNotes: section?.adminNotes ?? null,
            verifiedAt: section?.verifiedAt ?? null,
            verifierName: section?.verifiedBy?.name ?? section?.verifiedBy?.email ?? null,
          }
          return (
            <section key={type} className="space-y-3">
              {/* Context preview — surfaces the Phase 2 data the admin is verifying */}
              {type === 'BUSINESS' && <BusinessContext partner={partner} />}
              {type === 'FACILITY' && <CapabilitiesContext services={partner.services} />}
              {type === 'OPERATIONAL_STANDARDS' && (
                <CommercialContext
                  contract={partner.commercialTerms?.contractTerms ?? null}
                  signedAt={partner.commercialTerms?.signedAt ?? null}
                  signerName={signerName}
                  signerEmail={partner.user.email}
                  payoutTimingDays={partner.commercialTerms?.payoutTimingDays ?? null}
                  stripeAccountId={partner.user.stripeAccountId}
                  stripeAccountStatus={partner.user.stripeAccountStatus}
                />
              )}

              <SectionReview
                partnerId={partnerId}
                sectionType={type}
                label={SECTION_LABEL[type] ?? type}
                description={SECTION_DESCRIPTION[type] ?? ''}
                current={current}
                files={files}
              />
            </section>
          )
        })}

        {/* Cert-by-cert reviewer block — distinct from the 5-section grid */}
        <section className="space-y-3 pt-4">
          <CertificationsReview instances={certInstances} />
        </section>
      </div>
    </div>
  )
}
