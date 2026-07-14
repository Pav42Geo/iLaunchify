// Partner certifications page — claim certs from admin library + manage.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §7.2 + #129.
// Restyled 1:1 to the prototype "Certifications" settings panel
// (design/partner-profile-prototype-v2.html) via the panel-kit primitives.
//
// Layout:
//   Hero band (unchanged) → PanelCard: renewal InfoBanner + KpiStrip +
//     certificate LRows (status pill + renew) → PanelCard: "Add a
//     certification" picker (CertificateType library minus claimed types).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { certExpiryTone, daysUntilExpiry, cn } from '@ilaunchify/ui'
import { ShieldCheck, AlertCircle, Clock, Info, Plus } from 'lucide-react'
import { InfoBanner, KpiStrip, PanelCard, PanelHeader, StPill } from '@/components/panel-kit'
import { CertificationsClient } from './CertificationsClient'
import { RenewCertButton } from './RenewCertButton'
import { DownloadCertButton } from './DownloadCertButton'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certifications — iLaunchify Partners' }

export default async function CertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ renew?: string; claim?: string }>
}) {
  const { renew: renewId, claim: claimTypeId } = await searchParams
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingProgress: true },
  })
  if (!partner) return null

  const [certTypes, instances] = await Promise.all([
    prisma.certificateType.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, slug: true, description: true, thumbnailFileId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.partnerCertificateInstance.findMany({
      where: { partnerId: partner.id },
      include: {
        certificateType: {
          select: { name: true, slug: true, description: true, thumbnailFileId: true },
        },
      },
      orderBy: [{ status: 'asc' }, { expiryDate: 'asc' }],
    }),
  ])

  // CertificateType options for the "Add" picker — exclude types the partner
  // already has an ACTIVE/PENDING_REVIEW instance for (so they don't double-claim).
  const claimedTypeIds = new Set(
    instances
      .filter((i) => i.status === 'VERIFIED' || i.status === 'PENDING_REVIEW')
      .map((i) => i.certificateTypeId),
  )
  const availableTypes = certTypes.filter((t) => !claimedTypeIds.has(t.id))

  // Build CertificatePicker options (with branded badge thumbnails) for the
  // unified "Add a certification" selector.
  const availableBadgeUrls = await resolveCertBadgeUrls(availableTypes.map((t) => t.thumbnailFileId))
  const availableTypeOptions = availableTypes.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    thumbnailUrl: t.thumbnailFileId ? (availableBadgeUrls.get(t.thumbnailFileId) ?? null) : null,
  }))

  // Onboarding declarations → proof prompts. During onboarding the partner
  // DECLARED which cert types they carry (onboardingProgress.declaredCertTypeIds,
  // no PDF yet — "you'll upload the PDF for each after approval"). This is where
  // that promise is kept: every declared type without a claimed instance gets an
  // upload prompt that preselects it in the claim form below.
  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  const declaredIds = Array.isArray(progress.declaredCertTypeIds)
    ? (progress.declaredCertTypeIds as string[])
    : []
  const declaredPending = availableTypes.filter((t) => declaredIds.includes(t.id))

  const verified = instances.filter((i) => i.status === 'VERIFIED')
  const pending = instances.filter((i) => i.status === 'PENDING_REVIEW')
  const issues = instances.filter((i) => i.status === 'REJECTED' || i.status === 'EXPIRED')

  // Soonest-expiring VERIFIED cert inside the 90-day renewal window — drives
  // the renewal InfoBanner. Omitted entirely when nothing is expiring.
  const expiringSoon = verified.filter((i) => {
    const tone = certExpiryTone(i.expiryDate)
    return tone === 'soon' || tone === 'urgent'
  })
  const nextRenewal = expiringSoon[0] ?? null

  // Resolve the admin-curated PNG web badge per cert type — the same branded
  // mark shown publicly once VERIFIED.
  const certBadgeUrls = await resolveCertBadgeUrls(
    instances.map((i) => i.certificateType.thumbnailFileId),
  )
  const badgeFor = (i: { certificateType: { thumbnailFileId: string | null } }): string | null =>
    i.certificateType.thumbnailFileId
      ? (certBadgeUrls.get(i.certificateType.thumbnailFileId) ?? null)
      : null

  return (
    <div className="space-y-6">
      {instances.length === 0 ? (
        <PanelCard className="px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
            <ShieldCheck className="h-6 w-6 text-pink-700" aria-hidden="true" />
          </div>
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">No certifications yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            Claim a certification below to start the verification process. Admin reviews each
            within 1-2 business days.
          </p>
        </PanelCard>
      ) : (
        <PanelCard>
          {/* Prototype #p-certs panel-h — no page hero (Pavel 2026-07-13). */}
          <PanelHeader
            title="Certifications"
            desc="Your certificates gate marketplace eligibility & unlock profile badges. The PDF stays private to iLaunchify admin — only the branded badge shows publicly."
          />

          {nextRenewal && (
            <InfoBanner tone="info" icon={<Info aria-hidden="true" />}>
              <strong>{nextRenewal.certificateType.name}</strong> renews in{' '}
              {daysUntilExpiry(nextRenewal.expiryDate)} days — upload the new certificate to keep
              your standing.
            </InfoBanner>
          )}

          <KpiStrip
            items={[
              { v: verified.length, l: 'Verified' },
              {
                v: issues.length,
                l: 'Needs attention',
                vClassName: issues.length > 0 ? 'text-warning-500' : undefined,
              },
              { v: pending.length, l: 'Pending review' },
              { v: instances.length, l: 'Total certificates' },
            ]}
          />

          {[...verified, ...pending, ...issues].map((inst) => (
            <CertRow key={inst.id} inst={inst} badgeUrl={badgeFor(inst)} renewId={renewId} />
          ))}
        </PanelCard>
      )}

      {/* Declared during onboarding, proof still missing — keeps the onboarding
          promise ("you'll upload the PDF for each after approval"). */}
      {declaredPending.length > 0 && (
        <PanelCard>
          <PanelHeader
            title="Declared during onboarding"
            desc="You told us you carry these — upload the certificate PDF so admin can verify and unlock the public badge."
          />
          {declaredPending.map((t) => (
            <div
              key={t.id}
              className="mb-2.5 flex flex-wrap items-center gap-3.5 rounded-xl border border-warning-100 bg-warning-50/40 px-4 py-[15px] last:mb-0"
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-warning-50 text-warning-500">
                <Clock className="h-[19px] w-[19px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-ink-900">{t.name}</div>
                <div className="text-[12px] text-ink-500">Declared in onboarding · proof not uploaded yet</div>
              </div>
              <div className="ml-auto flex flex-none items-center gap-3">
                <StPill tone="warn">PROOF NEEDED</StPill>
                <Link
                  href={`/certifications?claim=${t.id}#add-cert`}
                  className="inline-flex items-center rounded-full bg-pink-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-pink-600"
                >
                  Upload proof
                </Link>
              </div>
            </div>
          ))}
        </PanelCard>
      )}

      {/* Claim / Add new cert */}
      <PanelCard id="add-cert">
        <PanelHeader
          title="Add a certification"
          desc={
            <>
              Pick from the admin-curated list below.
              {availableTypes.length === 0 && certTypes.length > 0 && (
                <> You&apos;ve already claimed every active certificate type — well done.</>
              )}
              {certTypes.length === 0 && (
                <>
                  {' '}
                  No certificate types are configured yet —{' '}
                  <Link href="mailto:partners@ilaunchify.com" className="underline">
                    contact admin
                  </Link>{' '}
                  to add the ones you carry.
                </>
              )}
            </>
          }
        />
        {availableTypes.length > 0 && (
          <CertificationsClient
            availableTypes={availableTypeOptions}
            initialSelectedTypeId={
              claimTypeId && availableTypes.some((t) => t.id === claimTypeId) ? claimTypeId : null
            }
          />
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-4">
          <p className="text-[13px] text-ink-500">Carry a certification that isn&apos;t listed?</p>
          <Link
            href="/certifications/request"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 transition-colors hover:bg-ink-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Request a new cert type
          </Link>
        </div>
      </PanelCard>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Internal — server-rendered certificate rows (prototype .lrow, flex-wrap so
// the inline renew form / reviewer note can break onto a full-width line)
// -----------------------------------------------------------------------------

type CertRowInstance = {
  id: string
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'EXPIRED' | 'REJECTED'
  certificateNumber: string | null
  issuingBody: string | null
  issueDate: Date | null
  expiryDate: Date
  rejectionReason: string | null
  notes: string | null
  replacedById: string | null
  certificateType: { name: string; slug: string; description: string }
}

function expMonthYear(d: Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function CertRow({
  inst,
  badgeUrl,
  renewId,
}: {
  inst: CertRowInstance
  badgeUrl?: string | null
  renewId?: string
}) {
  // Offer renewal when expired, or when a still-valid cert is within 90 days of
  // expiry (tone is 'soon' or 'urgent'). Pending/rejected rows don't renew.
  const tone = certExpiryTone(inst.expiryDate)
  const isExpiring = inst.status === 'VERIFIED' && (tone === 'soon' || tone === 'urgent')
  const canRenew = inst.status === 'EXPIRED' || isExpiring
  const days = daysUntilExpiry(inst.expiryDate)

  const chipCls = isExpiring
    ? 'bg-warning-50 text-warning-600'
    : inst.status === 'VERIFIED'
      ? 'bg-success-50 text-success-600'
      : inst.status === 'PENDING_REVIEW'
        ? 'bg-info-50 text-info-600'
        : 'bg-danger-50 text-danger-600'

  const sub = [
    inst.issuingBody,
    inst.certificateNumber ? `Cert #${inst.certificateNumber}` : null,
    `exp ${expMonthYear(inst.expiryDate)}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-3.5 rounded-xl border border-ink-200 px-4 py-[15px] transition-all last:mb-0 hover:border-ink-300 hover:shadow-sm">
      <span
        className={cn(
          'grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-[10px]',
          chipCls,
        )}
      >
        {badgeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={badgeUrl} alt="" className="h-full w-full bg-white object-contain p-1" />
        ) : isExpiring || inst.status === 'REJECTED' || inst.status === 'EXPIRED' ? (
          <AlertCircle className="h-[19px] w-[19px]" aria-hidden="true" />
        ) : inst.status === 'PENDING_REVIEW' ? (
          <Clock className="h-[19px] w-[19px]" aria-hidden="true" />
        ) : (
          <ShieldCheck className="h-[19px] w-[19px]" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ink-900">{inst.certificateType.name}</div>
        <div className="text-[12px] text-ink-500">{sub}</div>
      </div>
      <div className="ml-auto flex flex-none items-center gap-3">
        {isExpiring ? (
          <StPill tone="warn">EXPIRING · {days}d</StPill>
        ) : inst.status === 'VERIFIED' ? (
          <StPill tone="ok">VERIFIED</StPill>
        ) : inst.status === 'PENDING_REVIEW' ? (
          <StPill tone="info">PENDING REVIEW</StPill>
        ) : inst.status === 'REJECTED' ? (
          <StPill tone="danger">REJECTED</StPill>
        ) : (
          <StPill tone="danger">EXPIRED</StPill>
        )}
        <DownloadCertButton instanceId={inst.id} />
      </div>
      {/* Direct flex-wrap child: renders as an inline pill trigger when closed,
          and as a w-full form that wraps onto its own full-width line when open. */}
      {canRenew && (
        <RenewCertButton
          instanceId={inst.id}
          certName={inst.certificateType.name}
          renewalPending={!!inst.replacedById}
          autoOpen={renewId === inst.id}
        />
      )}
      {inst.status === 'REJECTED' && inst.rejectionReason && (
        <div className="w-full rounded-lg bg-danger-50 px-3 py-2 text-[12px] text-danger-800">
          <span className="font-semibold">Reviewer note: </span>
          {inst.rejectionReason}
        </div>
      )}
    </div>
  )
}
