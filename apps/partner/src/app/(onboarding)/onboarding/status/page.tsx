// Partner Application Status page — shown after submit-for-review, while
// admin verification is in progress and again after activation (briefly).
//
// Per docs/PARTNER_ONBOARDING.md §7 (Application Status surface). Surfaces:
//   - Overall status badge (Under review / Changes requested / Active)
//   - Per-section verification state with admin notes (if any)
//   - ETA expectation ("typically 3-5 business days")
//   - Deep-links back to /onboarding to address any NEEDS_CHANGES sections
//
// Authoritative source: PartnerVerificationSection rows (5 sections — see
// VerificationSectionType enum) + Partner.status (the 10-state FSM).

import Link from 'next/link'
import { CheckCircle2, Clock, AlertTriangle, FileText } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import type { VerificationSectionType, VerificationSectionStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Application status — iLaunchify Partners' }

const SECTION_LABELS: Record<VerificationSectionType, { label: string; jumpTo: string }> = {
  BUSINESS: { label: 'Business identity', jumpTo: '/onboarding#section-company-body' },
  FACILITY: { label: 'Capabilities & facility', jumpTo: '/onboarding#section-capabilities-body' },
  DOCUMENTS: { label: 'Compliance documents', jumpTo: '/onboarding#section-company-body' },
  PUBLIC_PROFILE: { label: 'Public profile', jumpTo: '/onboarding#section-company-body' },
  OPERATIONAL_STANDARDS: { label: 'Operational standards', jumpTo: '/onboarding#section-commercial-body' },
}

export default async function ApplicationStatusPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      verificationSections: { orderBy: { createdAt: 'asc' } },
      commercialTerms: { select: { signedAt: true } },
    },
  })

  if (!partner) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p>Partner profile not found.</p>
      </main>
    )
  }

  const needsChanges = partner.verificationSections.some((s) => s.status === 'NEEDS_CHANGES')
  const isActive = partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED'

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Application status
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{partner.companyName}</h1>
      </header>

      {/* Overall banner */}
      <OverallStatusBanner
        status={partner.status}
        needsChanges={needsChanges}
        submittedAt={partner.statusChangedAt}
      />

      {/* Per-section breakdown */}
      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-zinc-900">Section-by-section</h2>
        <div className="space-y-2">
          {partner.verificationSections.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-zinc-500">
                No verification sections yet. Go back to{' '}
                <Link href="/onboarding" className="underline">
                  /onboarding
                </Link>{' '}
                and complete the form.
              </CardContent>
            </Card>
          ) : (
            partner.verificationSections.map((section) => (
              <SectionRow
                key={section.id}
                type={section.type}
                status={section.status}
                adminNotes={section.adminNotes}
                verifiedAt={section.verifiedAt}
              />
            ))
          )}
        </div>
      </section>

      {/* Next-steps CTA */}
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-5">
        <div className="text-sm text-zinc-700">
          {isActive ? (
            <>
              <span className="font-semibold text-emerald-700">✓ You&apos;re live.</span> Head
              over to your dashboard to start receiving production orders.
            </>
          ) : needsChanges ? (
            <>
              We&apos;ve asked for a few changes — open the items above and resubmit.
            </>
          ) : (
            <>
              Reviews typically take <strong>3–5 business days</strong>. We&apos;ll email you
              when there&apos;s news.
            </>
          )}
        </div>
        <Button asChild className={isActive ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>
          <Link href={isActive ? '/dashboard' : '/onboarding'}>
            {isActive ? 'Go to dashboard →' : 'Edit application'}
          </Link>
        </Button>
      </footer>
    </main>
  )
}

// -----------------------------------------------------------------------------
// Overall status banner
// -----------------------------------------------------------------------------

function OverallStatusBanner({
  status,
  needsChanges,
  submittedAt,
}: {
  status: string
  needsChanges: boolean
  submittedAt: Date | null
}) {
  // 3 visual states: UNDER_REVIEW (default), NEEDS_CHANGES, ACTIVE.
  if (needsChanges) {
    return (
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="flex-1">
            <CardTitle className="text-amber-900">Changes requested</CardTitle>
            <p className="mt-1 text-sm text-amber-800">
              Our team reviewed your application and needs a few updates. See the sections
              below — fix the items, save, and we&apos;ll re-review.
            </p>
          </div>
        </CardHeader>
      </Card>
    )
  }

  if (status === 'ACTIVE' || status === 'INTEGRATION_ENHANCED') {
    return (
      <Card className="border-emerald-300 bg-emerald-50">
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
          <div className="flex-1">
            <CardTitle className="text-emerald-900">You&apos;re fully verified</CardTitle>
            <p className="mt-1 text-sm text-emerald-800">
              Your partner profile is live. Creators can now route production orders to you.
            </p>
          </div>
        </CardHeader>
      </Card>
    )
  }

  // Default: under review
  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <Clock className="mt-0.5 h-5 w-5 text-emerald-700" />
        <div className="flex-1">
          <CardTitle className="text-zinc-900">Under review</CardTitle>
          <p className="mt-1 text-sm text-zinc-600">
            {submittedAt ? (
              <>
                Submitted on <strong>{submittedAt.toLocaleDateString()}</strong>. Our team
                typically responds within <strong>3–5 business days</strong>. You&apos;ll get
                an email the moment there&apos;s news.
              </>
            ) : (
              <>Our team is reviewing your application — typically 3–5 business days.</>
            )}
          </p>
        </div>
      </CardHeader>
    </Card>
  )
}

// -----------------------------------------------------------------------------
// Per-section row
// -----------------------------------------------------------------------------

function SectionRow({
  type,
  status,
  adminNotes,
  verifiedAt,
}: {
  type: VerificationSectionType
  status: VerificationSectionStatus
  adminNotes: string | null
  verifiedAt: Date | null
}) {
  // SECTION_LABELS covers every VerificationSectionType enum value, but
  // tsc's lookup widening can't prove that. Fall back to a label-from-type
  // for forward-compat when new section types get added.
  const meta = SECTION_LABELS[type] ?? { label: type, jumpTo: '/onboarding' }
  const { Icon, color, label } = statusVisual(status)

  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900">{meta.label}</div>
            <span className={`text-xs font-medium ${color}`}>{label}</span>
          </div>
          {adminNotes && (
            <div className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold">Reviewer note: </span>
              {adminNotes}
            </div>
          )}
          {verifiedAt && (
            <p className="mt-1 text-xs text-zinc-500">
              Verified {verifiedAt.toLocaleDateString()}
            </p>
          )}
        </div>
        {status === 'NEEDS_CHANGES' && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={meta.jumpTo}>Edit</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function statusVisual(status: VerificationSectionStatus) {
  switch (status) {
    case 'VERIFIED':
      return { Icon: CheckCircle2, color: 'text-emerald-600', label: 'VERIFIED' }
    case 'NEEDS_CHANGES':
      return { Icon: AlertTriangle, color: 'text-amber-700', label: 'NEEDS CHANGES' }
    case 'REJECTED':
      return { Icon: AlertTriangle, color: 'text-red-600', label: 'REJECTED' }
    case 'PENDING':
    default:
      return { Icon: FileText, color: 'text-zinc-500', label: 'PENDING REVIEW' }
  }
}
