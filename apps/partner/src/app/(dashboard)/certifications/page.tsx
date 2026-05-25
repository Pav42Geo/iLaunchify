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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { ShieldCheck, FileText, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { CertificationsClient } from './CertificationsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certifications — iLaunchify Partners' }

export default async function CertificationsPage() {
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
        certificateType: { select: { name: true, slug: true, description: true } },
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Certifications</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Industry certs you carry (NSF, USDA Organic, cGMP, Kosher, etc.). Upload the
          original PDF — only iLaunchify admin sees it. Verified certs show as branded
          badges on your public partner page and on creator product detail pages.
        </p>
      </header>

      {instances.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-emerald-50 p-3">
              <ShieldCheck className="h-7 w-7 text-emerald-600" />
            </div>
            <CardTitle className="text-base">No certifications yet</CardTitle>
            <CardDescription className="max-w-md text-sm">
              Claim a certification below to start the verification process. Admin reviews
              each within 1-2 business days.
            </CardDescription>
          </CardContent>
        </Card>
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
                <CertRow key={inst.id} inst={inst} />
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
                <CertRow key={inst.id} inst={inst} />
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
                <CertRow key={inst.id} inst={inst} />
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
      </Card>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Internal — server-rendered sections / rows
// -----------------------------------------------------------------------------

import type { ComponentType } from 'react'

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
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`h-4 w-4 ${iconClass}`} />
          {title}
          <span className="ml-1 text-sm font-normal text-zinc-500">{count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">{children}</CardContent>
    </Card>
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
  certificateType: { name: string; slug: string; description: string }
}

function CertRow({ inst }: { inst: CertRowInstance }) {
  const expSoon = isExpiringSoon(inst.expiryDate)
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-zinc-100 p-2">
          <FileText className="h-4 w-4 text-zinc-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-zinc-900">{inst.certificateType.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
            {inst.issuingBody && <span>{inst.issuingBody}</span>}
            {inst.certificateNumber && <span>#{inst.certificateNumber}</span>}
            <span className={expSoon ? 'font-medium text-amber-700' : ''}>
              Expires {new Date(inst.expiryDate).toLocaleDateString()}
              {expSoon && ' ⚠'}
            </span>
          </div>
          {inst.status === 'REJECTED' && inst.rejectionReason && (
            <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
              <span className="font-semibold">Reviewer note: </span>
              {inst.rejectionReason}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function isExpiringSoon(d: Date): boolean {
  const ms = new Date(d).getTime() - Date.now()
  const days = ms / (1000 * 60 * 60 * 24)
  return days <= 60 && days > 0
}
