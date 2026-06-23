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
      return 'bg-green-50 text-green-700 ring-1 ring-green-200'
    case 'NEEDS_CHANGES':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    case 'REJECTED':
      return 'bg-red-50 text-red-700 ring-1 ring-red-200'
    case 'PENDING':
    default:
      return 'bg-ink-100 text-ink-700 ring-1 ring-ink-200'
  }
}

function statusLabel(status: VerificationSectionStatus): string {
  return status.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function MyApplicationPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: true,
      verificationSections: true,
      files: { orderBy: { uploadedAt: 'desc' } },
    },
  })

  // Once approved, the application is closed for the partner — the record is
  // retained in the admin console only. Send active partners to their dashboard.
  if (partner && (partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED')) {
    redirect('/dashboard')
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
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Manufacturing · My application
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          My application
        </h1>
        <p className="mt-1 text-[13px] text-ink-600">
          {partner.companyName} · Partner status:{' '}
          <span className="font-medium text-ink-900">{partner.status}</span>
        </p>
      </div>

      {partner.status === 'IN_PROGRESS' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base">Action required</CardTitle>
            <CardDescription className="text-amber-800">
              An admin has reviewed your application and requested changes. See the section
              notes below, make updates, and resubmit. The admin will be notified.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {partner.status === 'UNDER_REVIEW' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-base">Under review</CardTitle>
            <CardDescription className="text-blue-800">
              Your application is queued for admin review. We aim to respond within 2 business
              days. You&apos;ll get an email when each section is reviewed.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {partner.status === 'SUSPENDED' && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-base">Account suspended</CardTitle>
            <CardDescription className="text-red-800">
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
              partner.status === 'IN_PROGRESS' || status === 'NEEDS_CHANGES' || status === 'PENDING'

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
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Admin notes
                      </div>
                      <p className="whitespace-pre-wrap text-amber-900">{section.adminNotes}</p>
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
      <span className="text-xs uppercase text-ink-500">{label}</span>
      <span>{value || '—'}</span>
    </div>
  )
}
