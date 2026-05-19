// Per-partner verification queue.
// Renders one card per section (4 sections per Pavel decision 2026-05-19),
// each with a status picker + admin notes + file list. Overall status derived
// from sections; activation/suspension remain explicit on the partner detail page.

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
      user: true,
      verificationSections: {
        include: { verifiedBy: { select: { name: true, email: true } } },
      },
      files: { orderBy: { uploadedAt: 'desc' } },
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
              Derived from the 4 sections below. Activation remains a separate explicit step on
              the partner detail page.
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
              Partner has been asked to make changes. They&apos;ll see your notes on the My
              Application page (coming in A4) and resubmit.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
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
            <SectionReview
              key={type}
              partnerId={partnerId}
              sectionType={type}
              label={SECTION_LABEL[type]}
              description={SECTION_DESCRIPTION[type]}
              current={current}
              files={files}
            />
          )
        })}
      </div>
    </div>
  )
}
