// Partner-facing My Application page.
// Read-only view of submitted application data + per-section verification
// status + admin notes. "Edit section" buttons deep-link back into the wizard.
//
// Sections map to onboarding steps:
//   BUSINESS         → /onboarding/company
//   FACILITY         → /onboarding/service
//   DOCUMENTS        → /onboarding/documents
//   PUBLIC_PROFILE   → /onboarding/documents

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Pencil } from 'lucide-react'
import type {
  PartnerFile,
  VerificationSectionStatus,
  VerificationSectionType,
} from '@ilaunchify/db'
import { getPartnerRoleWord } from '@/lib/partner-role'
import { resolveActivationLimited } from '@/lib/activation-status'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Application — Partner' }

const SECTION_LABEL: Record<VerificationSectionType, string> = {
  BUSINESS: 'Business identity',
  FACILITY: 'Facility & capabilities',
  DOCUMENTS: 'Compliance documents',
  PUBLIC_PROFILE: 'Public profile',
  OPERATIONAL_STANDARDS: 'Operational standards',
}

const SECTION_HREF: Record<VerificationSectionType, string> = {
  BUSINESS: '/onboarding/company',
  FACILITY: '/onboarding/service',
  DOCUMENTS: '/onboarding/documents',
  PUBLIC_PROFILE: '/onboarding/documents',
  OPERATIONAL_STANDARDS: '/onboarding/service',
}

const ALL_SECTIONS: VerificationSectionType[] = [
  'BUSINESS',
  'FACILITY',
  'DOCUMENTS',
  'PUBLIC_PROFILE',
]

function statusBadgeClass(status: VerificationSectionStatus): string {
  switch (status) {
    case 'VERIFIED':
      return 'bg-success-50 text-success-700 ring-1 ring-success-200'
    case 'NEEDS_CHANGES':
      return 'bg-warning-50 text-warning-700 ring-1 ring-warning-200'
    case 'REJECTED':
      return 'bg-danger-50 text-danger-700 ring-1 ring-danger-200'
    case 'PENDING':
    default:
      return 'bg-ink-100 text-ink-700 ring-1 ring-ink-200'
  }
}

function statusLabel(status: VerificationSectionStatus): string {
  return status.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function MyApplicationPage() {
  const roleWord = await getPartnerRoleWord()
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: true,
      verificationSections: true,
      files: { orderBy: { uploadedAt: 'desc' } },
    },
  })

  // Approved partners (Pavel 2026-07-12, phased sidebar):
  //   • still in Activation Setup → the application stays visible as the
  //     READ-ONLY "Onboarding card" in the limited nav (no Edit buttons);
  //   • fully live → the application is closed; the record lives in the admin
  //     console only. Send them to their dashboard (pre-existing rule).
  const approved =
    partner && (partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED')
  let readOnly = false
  if (approved && partner) {
    const stillActivating = await resolveActivationLimited(partner)
    if (!stillActivating) redirect('/dashboard')
    readOnly = true
  }

  if (!partner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No partner record</CardTitle>
          <CardDescription>Start onboarding from /onboarding.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const sectionByType = new Map(partner.verificationSections.map((s) => [s.type, s]))
  const filesBySection = new Map<VerificationSectionType, PartnerFile[]>()
  for (const f of partner.files) {
    const list = filesBySection.get(f.sectionType) ?? []
    list.push(f)
    filesBySection.set(f.sectionType, list)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          {roleWord} · My application
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          My application
        </h1>
        <p className="mt-1 text-[13px] text-ink-600">
          {partner.companyName} · Partner status:{' '}
          <span className="font-medium text-ink-900">{partner.status}</span>
        </p>
      </div>

      {readOnly && (
        <Card className="border-success-200 bg-success-50">
          <CardHeader>
            <CardTitle className="text-base">Approved — read-only record</CardTitle>
            <CardDescription className="text-success-800">
              Your application passed review; this is the record you were approved on. Company
              details are now managed in Settings → Company profile, and each service goes live
              through Activation Setup.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {partner.status === 'IN_PROGRESS' && (
        <Card className="border-warning-200 bg-warning-50">
          <CardHeader>
            <CardTitle className="text-base">Action required</CardTitle>
            <CardDescription className="text-warning-800">
              An admin has reviewed your application and requested changes. See the section
              notes below, make updates, and resubmit. The admin will be notified.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {partner.status === 'UNDER_REVIEW' && (
        <Card className="border-info-200 bg-info-50">
          <CardHeader>
            <CardTitle className="text-base">Under review</CardTitle>
            <CardDescription className="text-info-800">
              Your application is queued for admin review. We aim to respond within 2 business
              days. You&apos;ll get an email when each section is reviewed.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {partner.status === 'SUSPENDED' && (
        <Card className="border-danger-200 bg-danger-50">
          <CardHeader>
            <CardTitle className="text-base">Account suspended</CardTitle>
            <CardDescription className="text-danger-800">
              Your partner account has been suspended. Email partners@ilaunchify.com to
              discuss reactivation.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Legal name" value={partner.legalName} />
          <Row label="Website" value={partner.websiteUrl} />
          <Row label="Phone" value={partner.contactPhone} />
          <Row
            label="Address"
            value={[
              partner.addressLine1,
              partner.addressLine2,
              [partner.city, partner.state, partner.postalCode].filter(Boolean).join(', '),
              partner.country,
            ]
              .filter(Boolean)
              .join(' · ') || null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {partner.services.length === 0 ? (
            <p className="text-ink-500">No services added yet.</p>
          ) : (
            partner.services.map((s) => (
              <div key={s.id} className="rounded border border-ink-200 p-3">
                <div className="font-medium">{s.type}</div>
                <div className="text-xs text-ink-500">
                  {s.status} · Disclosure: {s.disclosureLevel}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-700">
          Verification sections
        </h2>
        <div className="space-y-3">
          {ALL_SECTIONS.map((type) => {
            const section = sectionByType.get(type)
            const status = section?.status ?? 'PENDING'
            const files = filesBySection.get(type) ?? []
            const showEdit =
              !readOnly &&
              (partner.status === 'IN_PROGRESS' || status === 'NEEDS_CHANGES' || status === 'PENDING')

            return (
              <Card key={type}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{SECTION_LABEL[type]}</CardTitle>
                    <CardDescription>
                      {files.length} file{files.length === 1 ? '' : 's'} uploaded
                    </CardDescription>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
                  >
                    {statusLabel(status)}
                  </span>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section?.adminNotes && (
                    <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-sm">
                      <div className="mb-1 text-ui-label text-warning-700">
                        Admin notes
                      </div>
                      <p className="whitespace-pre-wrap text-warning-900">{section.adminNotes}</p>
                    </div>
                  )}
                  {showEdit && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={SECTION_HREF[type]}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Edit section
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[140px,1fr] items-baseline gap-2">
      <span className="text-ui-label text-ink-500">{label}</span>
      <span>{value || '—'}</span>
    </div>
  )
}
