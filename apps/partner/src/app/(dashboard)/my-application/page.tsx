// Partner-facing My Application page.
//
// TWO renderings (Pavel 2026-07-12):
//   • Pre-approval (IN_PROGRESS / UNDER_REVIEW / SUSPENDED restricted shell) —
//     the original editable view: status banners, section cards with "Edit
//     section" deep-links back into the wizard.
//   • Approved + still activating — the READ-ONLY "Onboarding record"
//     (1:1 port of design/my-application-readonly-tokens.html, minus its hero —
//     the original hero band stays): review timeline, sealed-record banner,
//     four verification sections with lock chips, right rail (What's next /
//     Documents on file / Request-a-change helpbox). No edit buttons — changes
//     route to Settings → Company profile or the re-review path.
//   • Fully live → redirect to /dashboard (application closed; pre-existing rule).
//
// Sections map to onboarding steps:
//   BUSINESS         → /onboarding/company
//   FACILITY         → /onboarding/service
//   DOCUMENTS        → /onboarding/documents
//   PUBLIC_PROFILE   → /onboarding/documents

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, cn } from '@ilaunchify/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  Globe,
  HelpCircle,
  Info,
  Lock,
  Package,
  Pencil,
  Rocket,
  Zap,
} from 'lucide-react'
import type {
  PartnerFile,
  VerificationSectionStatus,
  VerificationSectionType,
} from '@ilaunchify/db'
import { getPartnerRoleWord } from '@/lib/partner-role'
import { resolveActivationLimited, getPartnerActivationStatus } from '@/lib/activation-status'

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

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Print production',
  WAREHOUSE: 'Fulfillment',
}

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

const fmt = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

const prettyKind = (k: string) =>
  k.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

export default async function MyApplicationPage() {
  const roleWord = await getPartnerRoleWord()
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: true,
      verificationSections: true,
      facilities: true,
      files: { orderBy: { uploadedAt: 'desc' } },
    },
  })

  // Approved partners (Pavel 2026-07-12, phased sidebar):
  //   • still in Activation Setup → READ-ONLY "Onboarding record" below;
  //   • fully live → the application is closed; record lives in admin only.
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

  // The ORIGINAL hero band (kept per Pavel 2026-07-12) — shared by both views.
  const hero = (
    <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
      <div className="flex flex-wrap items-center gap-4">
        <div>
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
          <div className="ml-auto text-right">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success-100 bg-success-50 px-3.5 py-[7px] text-[12.5px] font-bold text-success-700">
              <CheckCircle2 className="h-[15px] w-[15px]" />
              Approved · read-only
            </span>
            <div className="mt-1.5 font-mono text-[11px] text-ink-400">
              APP-{partner.id.replace(/-/g, '').slice(0, 10).toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ==========================================================================
  // READ-ONLY ONBOARDING RECORD (approved, still activating)
  // ==========================================================================
  if (readOnly) {
    const activation = await getPartnerActivationStatus(partner.id)
    const liveCount = activation.liveServiceTypes.length
    const totalServices = activation.serviceTypes.length

    // Review timeline — real dates, '—' when a step wasn't recorded.
    const sections = partner.verificationSections
    const submittedAt = sections.length
      ? sections.reduce<Date>((min, s) => (s.createdAt < min ? s.createdAt : min), sections[0]!.createdAt)
      : null
    const identityAt = sectionByType.get('BUSINESS')?.verifiedAt ?? null
    const opsAt = (['FACILITY', 'OPERATIONAL_STANDARDS', 'PUBLIC_PROFILE'] as const)
      .map((t) => sectionByType.get(t)?.verifiedAt ?? null)
      .reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null)
    const approvedAt = partner.activatedAt ?? partner.statusChangedAt ?? null
    const timeline = [
      { label: 'Applied', date: partner.createdAt as Date | null },
      { label: 'Submitted', date: submittedAt },
      { label: 'Identity verified', date: identityAt },
      { label: 'Operations review', date: opsAt },
      { label: 'Approved', date: approvedAt, final: true },
    ]

    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const nameable = partner.services.filter((s) =>
      ['MANUFACTURING', 'COPACKING'].includes(s.type as string),
    )
    const disclosure = nameable.some((s) => s.disclosureLevel === 'FULL')
      ? 'Full "Manufactured by"'
      : nameable.some((s) => s.disclosureLevel === 'CITY_STATE')
        ? 'City + State'
        : nameable.length
          ? 'Anonymous'
          : '—'

    const address =
      [
        partner.addressLine1,
        [partner.city, partner.state, partner.postalCode].filter(Boolean).join(', '),
      ]
        .filter(Boolean)
        .join(', ') || '—'

    const verifiedMeta = (t: VerificationSectionType) => {
      const s = sectionByType.get(t)
      return s?.verifiedAt ? `Verified ${fmt(s.verifiedAt)} by iLaunchify review` : 'Submitted with your application'
    }

    return (
      <div className="space-y-4">
        {hero}

        {/* Review timeline */}
        <div className="flex items-start overflow-x-auto rounded-2xl border border-ink-200 bg-white px-5 py-[18px] shadow-sm">
          {timeline.map((t, i) => (
            <div key={t.label} className="relative min-w-[120px] flex-1 pt-1 text-center">
              <div
                className={cn(
                  'absolute top-[15px] h-0.5 bg-success-100',
                  i === 0 ? 'left-1/2 right-0' : i === timeline.length - 1 ? 'left-0 right-1/2' : 'inset-x-0',
                )}
              />
              <div
                className={cn(
                  'relative z-[1] mx-auto grid h-6 w-6 place-items-center rounded-full text-white',
                  t.final ? 'bg-ink-900 outline outline-[3px] outline-neon-500' : 'bg-success-500',
                )}
              >
                {t.final ? <Rocket className="h-[13px] w-[13px]" /> : <Check className="h-[13px] w-[13px]" strokeWidth={3} />}
              </div>
              <div className="mt-2 text-[12px] font-bold text-ink-900">{t.label}</div>
              <div className="text-[11px] text-ink-500">{fmt(t.date)}</div>
            </div>
          ))}
        </div>

        <div className="grid items-start gap-[22px] lg:grid-cols-[1fr_300px]">
          {/* ============ MAIN ============ */}
          <div className="space-y-4">
            {/* sealed-record banner */}
            <div className="flex items-start gap-3 rounded-2xl border border-success-100 bg-success-50 px-4 py-3.5">
              <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] flex-none text-success-600" />
              <div>
                <div className="text-[13.5px] font-bold text-success-700">
                  This is the record you were approved on — it&rsquo;s sealed.
                </div>
                <div className="mt-0.5 text-[12.5px] text-success-700/85">
                  Company details are now managed in{' '}
                  <Link href="/settings/company" className="font-semibold underline underline-offset-2">
                    Settings → Company profile
                  </Link>
                  ; each service goes live through{' '}
                  <Link href="/activation" className="font-semibold underline underline-offset-2">
                    Activation Setup
                  </Link>
                  . Identity or facility changes re-enter admin review.
                </div>
              </div>
            </div>

            {/* ① Business identity */}
            <RecordSection
              icon={<Building2 className="h-[18px] w-[18px]" />}
              title="Business identity"
              meta={verifiedMeta('BUSINESS')}
              status={sectionByType.get('BUSINESS')?.status ?? 'PENDING'}
            >
              <div className="grid gap-x-[26px] sm:grid-cols-2">
                <KvRow k="Doing-business-as" v={partner.companyName} />
                <KvRow k="Legal entity" v={partner.legalName} />
                <KvRow k="Website" v={partner.websiteUrl ?? '—'} />
                <KvRow k="Primary phone" v={partner.contactPhone ?? '—'} />
                <KvRow k="Primary facility" v={address} last />
              </div>
              <AdminNote note={sectionByType.get('BUSINESS')?.adminNotes} />
            </RecordSection>

            {/* ② Facility & capabilities */}
            <RecordSection
              icon={<Package className="h-[18px] w-[18px]" />}
              title="Facility & capabilities"
              meta={verifiedMeta('FACILITY')}
              status={sectionByType.get('FACILITY')?.status ?? 'PENDING'}
            >
              <SubHead>Services applied for</SubHead>
              <div className="flex flex-wrap gap-1.5">
                {partner.services.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center rounded-full border border-pink-100 bg-pink-50 px-2.5 py-1 text-[12px] font-medium text-pink-700"
                  >
                    {SERVICE_LABEL[s.type as string] ?? s.type}
                  </span>
                ))}
              </div>
              {partner.facilities.length > 0 && (
                <>
                  <SubHead className="mt-3.5">Facilities</SubHead>
                  <div className="grid gap-x-[26px] sm:grid-cols-2">
                    {partner.facilities.map((f, i) => (
                      <KvRow
                        key={f.id}
                        k={f.name}
                        v={`${f.city}, ${f.region}${f.isDefault ? ' · primary' : ''}`}
                        last={i >= partner.facilities.length - 2}
                      />
                    ))}
                  </div>
                </>
              )}
              <AdminNote note={sectionByType.get('FACILITY')?.adminNotes} />
            </RecordSection>

            {/* ③ Compliance documents */}
            <RecordSection
              icon={<FileText className="h-[18px] w-[18px]" />}
              title="Compliance documents"
              meta={`${(filesBySection.get('DOCUMENTS') ?? []).length} files · private, admin-reviewed`}
              status={sectionByType.get('DOCUMENTS')?.status ?? 'PENDING'}
            >
              {(filesBySection.get('DOCUMENTS') ?? []).length === 0 ? (
                <p className="text-[13px] text-ink-500">No documents on file.</p>
              ) : (
                (filesBySection.get('DOCUMENTS') ?? []).map((f) => {
                  const expiring = f.expiresAt != null && f.expiresAt <= soon
                  return (
                    <div
                      key={f.id}
                      className="mb-2.5 flex items-center gap-3 rounded-xl border border-dashed border-ink-300 px-3.5 py-3 last:mb-0"
                    >
                      <span
                        className={cn(
                          'grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px]',
                          expiring ? 'bg-warning-50 text-warning-500' : 'bg-success-50 text-success-600',
                        )}
                      >
                        <FileText className="h-[17px] w-[17px]" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-ink-900">
                          {prettyKind(f.kind as string)}
                        </div>
                        <div className="truncate text-[11px] text-ink-500">
                          {f.originalFilename} · uploaded {fmt(f.uploadedAt)}
                        </div>
                      </div>
                      <div className="ml-auto flex flex-none items-center gap-2">
                        {expiring && (
                          <>
                            <span className="inline-flex items-center rounded-full border border-warning-100 bg-warning-50 px-2.5 py-[3px] text-[11px] font-bold text-warning-700">
                              Renewal due {fmt(f.expiresAt)}
                            </span>
                            <Link
                              href="/help"
                              className="rounded-full bg-pink-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-pink-600"
                            >
                              Renew →
                            </Link>
                          </>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-[2px] text-[10px] font-semibold text-ink-500">
                          <Lock className="h-[9px] w-[9px]" />
                          Private
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
              <AdminNote note={sectionByType.get('DOCUMENTS')?.adminNotes} />
            </RecordSection>

            {/* ④ Public profile */}
            <RecordSection
              icon={<Globe className="h-[18px] w-[18px]" />}
              title="Public profile"
              meta={verifiedMeta('PUBLIC_PROFILE')}
              status={sectionByType.get('PUBLIC_PROFILE')?.status ?? 'PENDING'}
            >
              <div className="grid gap-x-[26px] sm:grid-cols-2">
                <KvRow k="Label disclosure" v={disclosure} last />
                <KvRow
                  k="Market participation"
                  v={partner.participationMode === 'PUBLIC' ? 'Public · open market' : 'Invited-only'}
                  last
                />
              </div>
              <div className="mt-3 flex gap-2.5 rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-3 text-[12.5px] text-ink-600">
                <ArrowRight className="mt-0.5 h-[15px] w-[15px] flex-none" />
                <div>
                  <b className="mb-0.5 block text-[11px] uppercase tracking-[0.04em] text-ink-500">
                    Live surface
                  </b>
                  Your tagline, bio and logo are edited in{' '}
                  <Link href="/settings/company" className="font-semibold underline underline-offset-2">
                    Settings → Company profile
                  </Link>{' '}
                  — not here.
                </div>
              </div>
              <AdminNote note={sectionByType.get('PUBLIC_PROFILE')?.adminNotes} />
            </RecordSection>
          </div>

          {/* ============ RIGHT RAIL ============ */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-ink-200 bg-white p-[18px] shadow-sm">
              <div className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-bold text-ink-900">
                <Zap className="h-4 w-4 text-pink-600" />
                What&rsquo;s next
              </div>
              <RailStep done title="Application approved" sub={`${fmt(approvedAt)} · identity + operations verified`} />
              <RailStep
                done={liveCount === totalServices && totalServices > 0}
                title="Finish Activation Setup"
                sub={`${liveCount} of ${totalServices} services live`}
              />
              <RailStep
                done={Boolean(partner.profilePublishedAt)}
                title="Publish your public profile"
                sub="Settings → Company profile"
              />
              <Link
                href="/activation"
                className="mt-3 block w-full rounded-full bg-ink-900 px-4 py-2.5 text-center text-[13px] font-semibold text-white transition-colors hover:bg-black"
              >
                Continue Activation Setup →
              </Link>
            </div>

            {partner.files.length > 0 && (
              <div className="rounded-2xl border border-ink-200 bg-white p-[18px] shadow-sm">
                <div className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-bold text-ink-900">
                  <FileText className="h-4 w-4 text-pink-600" />
                  Documents on file
                </div>
                <div className="space-y-2">
                  {partner.files.slice(0, 6).map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-[12.5px]">
                      <FileText className="h-3.5 w-3.5 flex-none text-ink-400" />
                      <span className="truncate font-semibold text-ink-900">{f.originalFilename}</span>
                      <span className="ml-auto whitespace-nowrap text-[11px] text-ink-400">
                        {fmt(f.uploadedAt)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 text-[11px] text-ink-400">
                  Private — visible to you and iLaunchify review only. Never shown on your public
                  profile.
                </div>
              </div>
            )}

            <div data-surface="dark" className="rounded-2xl bg-ink-900 p-[18px] text-white">
              <div className="flex items-center gap-2 font-display text-[15px] font-bold">
                <HelpCircle className="h-4 w-4 text-neon-500" />
                Need to change something?
              </div>
              <p className="mb-3 mt-2 text-[12.5px] text-ink-300">
                Identity, facility, or document changes on an approved record re-enter admin review
                to keep your verified status honest. Tell us what changed and we&rsquo;ll open the
                right section.
              </p>
              <Link
                href="/help"
                className="block w-full rounded-full bg-neon-500 px-4 py-2 text-center text-[13px] font-semibold text-ink-900 transition-colors hover:bg-neon-400"
              >
                Request a change
              </Link>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  // ==========================================================================
  // PRE-APPROVAL (original editable view — unchanged)
  // ==========================================================================
  return (
    <div className="space-y-6">
      {hero}

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

// -----------------------------------------------------------------------------
// Read-only record pieces (prototype: design/my-application-readonly-tokens.html)
// -----------------------------------------------------------------------------

function RecordSection({
  icon,
  title,
  meta,
  status,
  children,
}: {
  icon: React.ReactNode
  title: string
  meta: string
  status: VerificationSectionStatus
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-ink-100 px-[18px] py-[15px]">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-pink-50 text-pink-700">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[15.5px] font-bold text-ink-900">{title}</h3>
          <div className="truncate text-[11.5px] text-ink-500">{meta}</div>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600">
            <Lock className="h-[11px] w-[11px]" />
            Read-only
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-bold',
              statusBadgeClass(status),
            )}
          >
            {status === 'VERIFIED' && <Check className="h-3 w-3" strokeWidth={3} />}
            {statusLabel(status)}
          </span>
        </div>
      </div>
      <div className="px-[18px] py-4">{children}</div>
    </div>
  )
}

function KvRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div
      className={cn(
        'flex justify-between gap-3.5 border-b border-ink-100 py-2 text-[13px]',
        last && 'sm:border-b-0',
      )}
    >
      <span className="text-ink-500">{k}</span>
      <span className="text-right font-semibold text-ink-900">{v}</span>
    </div>
  )
}

function SubHead({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-400', className)}>
      {children}
    </div>
  )
}

function AdminNote({ note }: { note: string | null | undefined }) {
  if (!note) return null
  return (
    <div className="mt-3 flex gap-2.5 rounded-xl border border-info-100 bg-info-50 px-3.5 py-3 text-[12.5px] text-info-800">
      <Info className="mt-0.5 h-[15px] w-[15px] flex-none" />
      <div>
        <b className="mb-0.5 block text-[11px] uppercase tracking-[0.04em]">Admin note</b>
        <span className="whitespace-pre-wrap">{note}</span>
      </div>
    </div>
  )
}

function RailStep({ done, title, sub }: { done?: boolean; title: string; sub: string }) {
  return (
    <div className="flex gap-2.5 border-b border-ink-100 py-2 text-[12.5px] last:border-b-0">
      <span
        className={cn(
          'grid h-5 w-5 flex-none place-items-center rounded-full',
          done ? 'bg-success-50 text-success-600' : 'bg-pink-50 text-pink-600',
        )}
      >
        {done ? <Check className="h-3 w-3" strokeWidth={3} /> : <Rocket className="h-3 w-3" />}
      </span>
      <div>
        <b className="block font-semibold text-ink-900">{title}</b>
        <span className="text-[11.5px] text-ink-500">{sub}</span>
      </div>
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
