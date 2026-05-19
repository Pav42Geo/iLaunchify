import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { PartnerActions } from './PartnerActions'
import { computeOverallStatus, statusBadgeClass } from '@/lib/verification'

export const dynamic = 'force-dynamic'

export default async function PartnerDetail({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      user: true,
      services: {
        include: { dieCutSupport: { include: { dieCutTemplate: true } } },
      },
      verificationSections: true,
    },
  })
  if (!partner) notFound()

  const overall = computeOverallStatus(partner.verificationSections)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{partner.companyName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {partner.user.email} · status <span className="font-medium">{partner.status}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr,320px]">
        <div className="space-y-4">
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
              <Row
                label="Stripe Connect"
                value={
                  partner.user.stripeAccountId
                    ? `${partner.user.stripeAccountStatus} (${partner.user.stripeAccountId})`
                    : 'Not connected'
                }
              />
            </CardContent>
          </Card>

          {partner.services.map((service) => (
            <Card key={service.id}>
              <CardHeader>
                <CardTitle className="text-base">Service · {service.type}</CardTitle>
                <CardDescription>
                  {service.status} · Disclosure: {service.disclosureLevel}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Capabilities (JSON)" value={JSON.stringify(service.capabilities, null, 2)} mono />
                {service.dieCutSupport.length > 0 && (
                  <div>
                    <div className="text-xs uppercase text-zinc-500">Die-cut support</div>
                    <ul className="mt-1 space-y-1">
                      {service.dieCutSupport.map((d) => (
                        <li key={d.dieCutTemplateId} className="rounded border border-zinc-200 p-2">
                          <span className="font-medium">{d.dieCutTemplate.name}</span>
                          {d.surchargeCents != null && (
                            <span className="ml-2 text-xs text-zinc-500">
                              +${(d.surchargeCents / 100).toFixed(2)} surcharge
                            </span>
                          )}
                          {d.leadTimeDays != null && (
                            <span className="ml-2 text-xs text-zinc-500">
                              {d.leadTimeDays}d lead
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Verification</CardTitle>
                <CardDescription>4-section review</CardDescription>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${statusBadgeClass(overall)}`}
              >
                {overall.replace('_', ' ')}
              </span>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="outline">
                <Link href={`/partners/${partnerId}/verification`}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Review sections
                </Link>
              </Button>
            </CardContent>
          </Card>

          <PartnerActions partnerId={partner.id} currentStatus={partner.status} />
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[140px,1fr] items-baseline gap-2">
      <span className="text-xs uppercase text-zinc-500">{label}</span>
      <span className={mono ? 'whitespace-pre-wrap break-all font-mono text-xs' : ''}>
        {value || '—'}
      </span>
    </div>
  )
}
