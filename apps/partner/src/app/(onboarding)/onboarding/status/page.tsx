// Partner Application Status page — shown after submit-for-review, while
// admin verification is in progress and again after activation (briefly).
//
// Per docs/PARTNER_ONBOARDING.md §7 (Application Status surface). Surfaces:
//   - Overall status (Under review / Changes requested / Verified)
//   - Per-section verification state with admin notes (if any), as a timeline
//   - ETA expectation ("typically 3-5 business days")
//   - Deep-links back to /onboarding to address any NEEDS_CHANGES sections
//
// 2026-06-26 (Pavel): wears the editorial /pricing look — pink eyebrow +
// Fraunces-italic state-aware headline in a contained grid-pattern banner +
// a polished vertical verification timeline. Contained (not full-bleed): this
// route lives in the (onboarding) shell, not the dashboard shell that supports
// the bleed. See [[ilaunchify-account-landing-pattern]].
//
// Authoritative source: PartnerVerificationSection rows (5 sections — see
// VerificationSectionType enum) + Partner.status (the 10-state FSM).

import Link from 'next/link'
import { CheckCircle2, Clock, AlertTriangle, FileText, ArrowRight } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Button } from '@ilaunchify/ui'
import type { VerificationSectionType, VerificationSectionStatus } from '@ilaunchify/db'

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

  const sections = partner.verificationSections
  const total = sections.length
  const verifiedCount = sections.filter((s) => s.status === 'VERIFIED').length
  const needsChanges = sections.some((s) => s.status === 'NEEDS_CHANGES')
  const isActive = partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED'

  const hero = isActive
    ? { lead: 'You’re', em: 'in.', sub: `${partner.companyName} is fully verified — creators can route production orders to you now.` }
    : needsChanges
      ? { lead: 'Almost there —', em: 'a few tweaks.', sub: `We reviewed ${partner.companyName} and need a couple of updates before you go live.` }
      : { lead: 'You’re', em: 'almost in.', sub: `${partner.companyName}’s application is in review — we typically respond within 3–5 business days.` }

  const pill = isActive
    ? { Icon: CheckCircle2, label: 'Fully verified', className: 'bg-success-50 text-success-700 ring-success-200' }
    : needsChanges
      ? { Icon: AlertTriangle, label: 'Changes requested', className: 'bg-warning-50 text-warning-700 ring-warning-200' }
      : { Icon: Clock, label: 'Under review', className: 'bg-info-50 text-info-700 ring-info-200' }

  return (
    <div className="mx-auto max-w-3xl pb-4">
      {/* Editorial hero — contained grid-pattern banner */}
      <section className="relative overflow-hidden rounded-3xl border border-ink-100 bg-white px-6 py-12 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(#FFD0E0 1px, transparent 1px), linear-gradient(90deg, #FFD0E0 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            opacity: 0.55,
            maskImage: 'radial-gradient(110% 95% at 50% -8%, #000 26%, transparent 76%)',
            WebkitMaskImage: 'radial-gradient(110% 95% at 50% -8%, #000 26%, transparent 76%)',
          }}
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700">Application status</p>
          <h1 className="mx-auto mt-2 font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-4xl">
            {hero.lead}{' '}
            <span className="font-serif text-pink-500 italic font-medium tracking-[-0.02em]">{hero.em}</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ink-700">{hero.sub}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[12px] font-semibold uppercase tracking-wide ring-1 ${pill.className}`}>
              <pill.Icon className="h-3.5 w-3.5" aria-hidden="true" /> {pill.label}
            </span>
            {total > 0 && !isActive && (
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-ink-200 bg-white/80 px-3 py-1 text-[12px] font-medium text-ink-600 backdrop-blur-sm">
                {verifiedCount} of {total} sections verified
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Verification timeline */}
      <section className="mt-10">
        <div className="mb-5 text-center">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700">Verification</div>
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink-900 sm:text-3xl">
            Where your{' '}
            <span className="font-serif text-pink-500 italic font-medium tracking-[-0.02em]">review stands.</span>
          </h2>
        </div>

        {total === 0 ? (
          <div className="rounded-2xl border border-ink-200 bg-white px-6 py-8 text-center text-sm text-ink-500">
            No verification sections yet. Go back to{' '}
            <Link href="/onboarding" className="font-medium text-pink-700 underline">
              your application
            </Link>{' '}
            and complete the form.
          </div>
        ) : (
          <ol className="rounded-2xl border border-ink-200 bg-white px-5 py-5 sm:px-7">
            {sections.map((section, i) => (
              <TimelineRow
                key={section.id}
                type={section.type}
                status={section.status}
                adminNotes={section.adminNotes}
                verifiedAt={section.verifiedAt}
                last={i === sections.length - 1}
              />
            ))}
          </ol>
        )}
      </section>

      {/* Next-steps CTA */}
      {isActive ? (
        <section data-surface="dark" className="mt-10 overflow-hidden rounded-3xl bg-ink-900 px-6 py-10 text-center text-white">
          <h2 className="mx-auto max-w-[22ch] font-display text-2xl font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-3xl [&_em]:font-serif [&_em]:font-medium [&_em]:italic [&_em]:text-neon-500">
            You’re live — <em>start producing.</em>
          </h2>
          <p className="mx-auto mt-3 max-w-[44ch] text-[14px] text-ink-300">
            Head to your dashboard to accept your first production orders.
          </p>
          <div className="mt-6 flex justify-center">
            <Button asChild variant="neon" size="lg">
              <Link href="/dashboard">
                Go to dashboard <ArrowRight strokeWidth={2.5} className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      ) : (
        <section className="mt-10 flex flex-col items-center justify-between gap-4 rounded-3xl border border-ink-200 bg-white px-6 py-6 text-center sm:flex-row sm:text-left">
          <p className="text-[14px] text-ink-700">
            {needsChanges ? (
              <>Open the flagged sections above, make the updates, and resubmit — we’ll re-review right away.</>
            ) : (
              <>Reviews typically take <strong className="font-semibold text-ink-900">3–5 business days</strong>. We’ll email you the moment there’s news.</>
            )}
          </p>
          <Button asChild variant={needsChanges ? 'primary' : 'secondary'} size="md" className="flex-shrink-0">
            <Link href="/onboarding">
              {needsChanges ? 'Edit application' : 'Review application'} <ArrowRight strokeWidth={2.5} className="h-4 w-4" />
            </Link>
          </Button>
        </section>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Timeline row — one verification section as a connected node
// -----------------------------------------------------------------------------

function TimelineRow({
  type,
  status,
  adminNotes,
  verifiedAt,
  last,
}: {
  type: VerificationSectionType
  status: VerificationSectionStatus
  adminNotes: string | null
  verifiedAt: Date | null
  last: boolean
}) {
  // SECTION_LABELS covers every VerificationSectionType, but tsc's lookup
  // widening can't prove it — fall back to the raw type for forward-compat.
  const meta = SECTION_LABELS[type] ?? { label: type, jumpTo: '/onboarding' }
  const v = statusVisual(status)

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* connector line */}
      {!last && <span aria-hidden="true" className="absolute left-[15px] top-9 h-[calc(100%-1.75rem)] w-px bg-ink-200" />}

      {/* status node */}
      <span className={`relative z-10 mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ring-1 ${v.nodeClassName}`}>
        <v.Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[14px] font-semibold text-ink-900">{meta.label}</div>
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${v.textClassName}`}>{v.label}</span>
        </div>
        {adminNotes && (
          <div className="mt-2 rounded-lg bg-warning-50 px-3 py-2 text-[12.5px] text-warning-900">
            <span className="font-semibold">Reviewer note: </span>
            {adminNotes}
          </div>
        )}
        {verifiedAt && (
          <p className="mt-1 text-[12px] text-ink-500">Verified {verifiedAt.toLocaleDateString()}</p>
        )}
        {status === 'NEEDS_CHANGES' && (
          <Button asChild variant="outline" size="sm" className="mt-2.5">
            <Link href={meta.jumpTo}>Fix this section</Link>
          </Button>
        )}
      </div>
    </li>
  )
}

function statusVisual(status: VerificationSectionStatus): {
  Icon: typeof CheckCircle2
  label: string
  textClassName: string
  nodeClassName: string
} {
  switch (status) {
    case 'VERIFIED':
      return { Icon: CheckCircle2, label: 'Verified', textClassName: 'text-success-700', nodeClassName: 'bg-success-50 text-success-600 ring-success-200' }
    case 'NEEDS_CHANGES':
      return { Icon: AlertTriangle, label: 'Needs changes', textClassName: 'text-warning-700', nodeClassName: 'bg-warning-50 text-warning-700 ring-warning-200' }
    case 'REJECTED':
      return { Icon: AlertTriangle, label: 'Rejected', textClassName: 'text-danger-700', nodeClassName: 'bg-danger-50 text-danger-600 ring-danger-200' }
    case 'PENDING':
    default:
      return { Icon: FileText, label: 'Pending review', textClassName: 'text-ink-500', nodeClassName: 'bg-ink-100 text-ink-500 ring-ink-200' }
  }
}
