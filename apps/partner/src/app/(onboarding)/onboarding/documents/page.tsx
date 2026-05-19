// Documents step of the partner onboarding wizard.
// Real R2 upload UI via @ilaunchify/storage (Phase A — see docs/FOD_RECOVERY_PLAN.md).
//
// Slot layout:
//   BUSINESS section
//     - Certificate of Incorporation / Business registration
//   FACILITY section
//     - Facility photos
//   DOCUMENTS section
//     - FDA / cGMP certificate
//     - General liability insurance
//   PUBLIC_PROFILE section
//     - Company logo (used on storefront partner pages)
//
// Each slot accepts multiple files. PartnerFile rows + AuditLog entries are
// created server-side via actions.ts.

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { FileUploadSlot, type ExistingFile } from './FileUploadSlot'
import type { PartnerFile, PartnerFileKind, VerificationSectionType } from '@prisma/client'

export const dynamic = 'force-dynamic'

// Slot definitions — keep grouped by section for visual hierarchy
const SLOTS: Array<{
  sectionType: VerificationSectionType
  sectionLabel: string
  items: Array<{
    label: string
    description: string
    kind: PartnerFileKind
    required: boolean
  }>
}> = [
  {
    sectionType: 'BUSINESS',
    sectionLabel: 'Business identity',
    items: [
      {
        label: 'Certificate of incorporation',
        description: 'Articles of incorporation or business registration document.',
        kind: 'CERT_OF_INCORPORATION',
        required: true,
      },
      {
        label: 'Business license',
        description: 'State / county business license.',
        kind: 'BUSINESS_LICENSE',
        required: true,
      },
    ],
  },
  {
    sectionType: 'FACILITY',
    sectionLabel: 'Facility & capabilities',
    items: [
      {
        label: 'Facility photos',
        description: 'Production floor, packaging area, storage. 3–6 photos.',
        kind: 'FACILITY_PHOTO',
        required: false,
      },
    ],
  },
  {
    sectionType: 'DOCUMENTS',
    sectionLabel: 'Compliance documents',
    items: [
      {
        label: 'FDA / cGMP certificate',
        description: 'FDA establishment registration or cGMP certification.',
        kind: 'CERTIFICATE',
        required: true,
      },
      {
        label: 'General liability insurance',
        description: 'Current COI showing $1M+ general liability coverage.',
        kind: 'INSURANCE',
        required: true,
      },
    ],
  },
  {
    sectionType: 'PUBLIC_PROFILE',
    sectionLabel: 'Public profile',
    items: [
      {
        label: 'Company logo',
        description: 'PNG with transparent background preferred. Used on your public partner page.',
        kind: 'LOGO',
        required: false,
      },
    ],
  },
]

function fileToExisting(file: PartnerFile): ExistingFile {
  return {
    id: file.id,
    originalFilename: file.originalFilename,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt,
  }
}

export default async function DocumentsStep() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { files: { orderBy: { uploadedAt: 'desc' } } },
  })

  if (!partner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Partner profile not found</CardTitle>
          <CardDescription>
            Complete the company step first. <Link href="/onboarding/company" className="underline">Go back</Link>
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Index files by (sectionType + kind) so each slot gets its own list cheaply
  const filesBySlot = new Map<string, PartnerFile[]>()
  for (const f of partner.files) {
    const key = `${f.sectionType}:${f.kind}`
    const list = filesBySlot.get(key) ?? []
    list.push(f)
    filesBySlot.set(key, list)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Upload the documents below so admins can verify your partner profile. Files are
            stored privately on Cloudflare R2; only admins reviewing your application can
            see them. You can come back and add more later.
          </CardDescription>
        </CardHeader>
      </Card>

      {SLOTS.map((section) => (
        <section key={section.sectionType} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {section.sectionLabel}
          </h2>
          <div className="space-y-3">
            {section.items.map((item) => {
              const slotKey = `${section.sectionType}:${item.kind}`
              const files = (filesBySlot.get(slotKey) ?? []).map(fileToExisting)
              return (
                <FileUploadSlot
                  key={slotKey}
                  label={item.label}
                  description={item.description}
                  sectionType={section.sectionType}
                  kind={item.kind}
                  existingFiles={files}
                  required={item.required}
                />
              )
            })}
          </div>
        </section>
      ))}

      <div className="flex justify-between">
        <Button asChild variant="outline">
          <Link href="/onboarding/service">Back</Link>
        </Button>
        <Button asChild>
          <Link href="/onboarding/stripe">Continue</Link>
        </Button>
      </div>
    </div>
  )
}
