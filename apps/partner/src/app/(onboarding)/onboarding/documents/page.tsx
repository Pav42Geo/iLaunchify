// Documents step of the partner onboarding wizard.
// Real R2 upload UI via @ilaunchify/storage (Phase A — see docs/FOD_RECOVERY_PLAN.md).
//
// Partner Role Accounts P0 (docs/PARTNER_ROLE_ACCOUNTS.md §4.1): the slot list
// is no longer static — it renders the ROLE-SPECIFIC document track from
// docTrackFor(serviceTypes) (@ilaunchify/db). An FC sees warehouse docs, a
// printer sees the food-contact attestation, producing roles see the full
// food-safety package. Expiring documents capture their expiry date and feed
// the Expiry Engine (partner-ops cron).
//
// Each slot accepts multiple files. PartnerFile rows + AuditLog entries are
// created server-side via actions.ts.

import { Card, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'
import { prisma, docTrackFor } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { FileUploadSlot, type ExistingFile } from './FileUploadSlot'
import type { PartnerFile, PartnerFileKind, VerificationSectionType } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'

const SECTION_LABEL: Record<string, string> = {
  BUSINESS: 'Business identity',
  FACILITY: 'Facility & capabilities',
  DOCUMENTS: 'Compliance documents',
  PUBLIC_PROFILE: 'Public profile',
}
const SECTION_ORDER = ['BUSINESS', 'FACILITY', 'DOCUMENTS', 'PUBLIC_PROFILE']

function fileToExisting(file: PartnerFile): ExistingFile {
  return {
    id: file.id,
    originalFilename: file.originalFilename,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt,
    expiresAt: file.expiresAt,
  }
}

export default async function DocumentsStep() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      files: { orderBy: { uploadedAt: 'desc' } },
      services: { select: { type: true } },
    },
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

  // Role-specific track (docs/PARTNER_ROLE_ACCOUNTS.md §4.1), grouped by
  // verification section. Multiple track rows can share a PartnerFileKind
  // (e.g. several CERTIFICATE docs) — files index by (sectionType + kind), so
  // shared-kind slots show the same pool; the track labels tell the partner
  // what belongs in each.
  const serviceTypes = partner.services.map((s) => s.type as string)
  const track = docTrackFor(serviceTypes)
  const sections = SECTION_ORDER.filter((s) => track.some((d) => d.sectionType === s))

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
            This checklist is tailored to the services you selected
            {serviceTypes.length > 0 ? '' : ' (pick your services in the Business step to see role-specific requirements)'}.
            Files are stored privately; only admins reviewing your application can see them.
            Expiring documents are tracked — we remind you before anything lapses.
          </CardDescription>
        </CardHeader>
      </Card>

      {sections.map((sectionType) => (
        <section key={sectionType} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-700">
            {SECTION_LABEL[sectionType] ?? sectionType}
          </h2>
          <div className="space-y-3">
            {track
              .filter((d) => d.sectionType === sectionType)
              .map((d) => {
                const slotKey = `${d.sectionType}:${d.kind}`
                const files = (filesBySlot.get(slotKey) ?? []).map(fileToExisting)
                return (
                  <FileUploadSlot
                    key={d.key}
                    label={d.label}
                    description={d.description}
                    sectionType={d.sectionType as VerificationSectionType}
                    kind={d.kind as PartnerFileKind}
                    existingFiles={files}
                    required={d.requirement === 'REQUIRED'}
                    conditionNote={d.requirement === 'CONDITIONAL' ? d.conditionNote : undefined}
                    expiring={d.expiring}
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
