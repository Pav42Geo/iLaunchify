// Partner certifications page — claim certs from admin library + manage.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §7.2 + #129.
//
// Layout:
//   "Your certifications" section — current claimed instances grouped by
//     status (Verified / Pending review / Needs attention).
//   "Add a certification" picker — CertificateType library minus types
//     the partner already has an active claim for.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CertExpiryBadge,
  certExpiryTone,
  cn,
} from '@ilaunchify/ui'
import { ShieldCheck, FileText, AlertTriangle, CheckCircle2, Clock, type LucideIcon } from 'lucide-react'
import { CertificationsClient } from './CertificationsClient'
import { RenewCertButton } from './RenewCertButton'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certifications — iLaunchify Partners' }

export default async function CertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ renew?: string }>
}) {
  const { renew: renewId } = await searchParams
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return null

  const [certTypes, instances] = await Promise.all([
    prisma.certificateType.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, slug: true, description: true },
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

  const verified = instances.filter((i) => i.status === 'VERIFIED')
  const pending = instances.filter((i) => i.status === 'PENDING_REVIEW')
  const issues = instances.filter((i) => i.status === 'REJECTED' || i.status === 'EXPIRED')

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
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Manufacturing · Certifications
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Certifications
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Industry certs you carry (NSF, USDA Organic, cGMP, Kosher, etc.). Upload the original
          PDF — only iLaunchify admin sees it. Verified certs show as branded badges publicly.
        </p>
        {instances.length > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Kpi label="Verified" value={verified.length} icon={CheckCircle2} tone="ink" />
            <Kpi label="Pending review" value={pending.length} icon={Clock} tone="amber" />
            <Kpi label="Needs attention" value={issues.length} icon={AlertTriangle} tone="pink" />
          </div>
        )}
      </div>

      {instances.length === 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
            <ShieldCheck className="h-6 w-6 text-pink-700" aria-hidden="true" />
          </div>
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">No certifications yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            Claim a certification below to start the verification process. Admin reviews each
            within 1-2 business days.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {verified.length > 0 && (
            <CertSection
              title="Verified"
              count={verified.length}
              icon={CheckCircle2}
              iconClass="text-emerald-600"
            >
              {verified.map((inst) => (
                <CertRow key={inst.id} inst={inst} badgeUrl={badgeFor(inst)} renewId={renewId} />
              ))}
            </CertSection>
          )}
          {pending.length > 0 && (
            <CertSection
              title="Pending review"
              count={pending.length}
              icon={Clock}
              iconClass="text-amber-600"
            >
              {pending.map((inst) => (
                <CertRow key={inst.id} inst={inst} badgeUrl={badgeFor(inst)} renewId={renewId} />
              ))}
            </CertSection>
          )}
          {issues.length > 0 && (
            <CertSection
              title="Needs attention"
              count={issues.length}
              icon={AlertTriangle}
              iconClass="text-red-600"
            >
              {issues.map((inst) => (
                <CertRow key={inst.id} inst={inst} badgeUrl={badgeFor(inst)} renewId={renewId} />
              ))}
            </CertSection>
          )}
        </div>
      )}

      {/* Claim / Add new cert */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a certification</CardTitle>
          <CardDescription>
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
          </CardDescription>
        </CardHeader>
        {availableTypes.length > 0 && (
          <CardContent>
            <CertificationsClient availableTypes={availableTypes} />
          </CardContent>
        )}
        <CardContent className="border-t border-ink-100 pt-4">
          <p className="text-sm text-ink-500">
            Carry a certification that isn&apos;t listed?{' '}
            <Link
              href="/certifications/request"
              className="font-medium text-pink-700 underline-offset-2 hover:underline"
            >
              Request a new cert type →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Internal — server-rendered sections / rows
// -----------------------------------------------------------------------------

import type { ComponentType } from 'react'

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: 'ink' | 'amber' | 'pink'
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    amber: 'bg-amber-100 text-amber-700',
    pink: 'bg-pink-100 text-pink-700',
  }
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

function CertSection({
  title,
  count,
  icon: Icon,
  iconClass,
  children,
}: {
  title: string
  count: number
  icon: ComponentType<{ className?: string }>
  iconClass: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex items-center gap-2 border-b border-ink-100 bg-cream px-4 py-2.5">
        <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
        <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
          {title}
        </h2>
        <span className="text-[12px] font-normal text-ink-500">{count}</span>
      </header>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  )
}

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
  const canRenew =
    inst.status === 'EXPIRED' ||
    (inst.status === 'VERIFIED' && (tone === 'soon' || tone === 'urgent'))

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3">
      <div className="flex items-start gap-3">
        {badgeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={badgeUrl}
            alt=""
            className="h-9 w-9 flex-shrink-0 rounded-md border border-ink-200 bg-white object-contain p-1"
          />
        ) : (
          <div className="rounded-md bg-ink-100 p-2">
            <FileText className="h-4 w-4 text-ink-500" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-ink-900">{inst.certificateType.name}</div>
            <CertExpiryBadge expiryDate={inst.expiryDate} />
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-500">
            {inst.issuingBody && <span>{inst.issuingBody}</span>}
            {inst.certificateNumber && <span>#{inst.certificateNumber}</span>}
            <span>Expires {new Date(inst.expiryDate).toLocaleDateString()}</span>
          </div>
          {inst.status === 'REJECTED' && inst.rejectionReason && (
            <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
              <span className="font-semibold">Reviewer note: </span>
              {inst.rejectionReason}
            </div>
          )}
          {canRenew && (
            <div className="mt-2">
              <RenewCertButton
                instanceId={inst.id}
                certName={inst.certificateType.name}
                renewalPending={!!inst.replacedById}
                autoOpen={renewId === inst.id}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
