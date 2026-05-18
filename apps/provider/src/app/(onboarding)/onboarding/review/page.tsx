import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { SubmitForReviewButton } from './SubmitForReviewButton'

export default async function ReviewStep() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: true },
  })
  if (!partner) return null

  const alreadySubmitted = partner.status === 'UNDER_REVIEW'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit for review</CardTitle>
        <CardDescription>
          {alreadySubmitted
            ? "We've received your profile and will activate within 1-2 business days."
            : 'Final check before we activate your partner account.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="Company">
          <Row label="Name" value={`${partner.companyName} (${partner.legalName})`} />
          <Row label="Location" value={`${partner.city}, ${partner.state}, ${partner.country}`} />
          <Row label="Phone" value={partner.contactPhone} />
          <Row label="Website" value={partner.websiteUrl} />
        </Section>

        {partner.services.map((s) => (
          <Section key={s.id} title={`Service · ${s.type}`}>
            <Row label="Disclosure" value={s.disclosureLevel} />
            <Row label="Capabilities" value={JSON.stringify(s.capabilities, null, 2)} mono />
          </Section>
        ))}

        {!alreadySubmitted && (
          <div className="flex justify-end">
            <SubmitForReviewButton partnerId={partner.id} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-700">{title}</h3>
      <div className="space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">{children}</div>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px,1fr] items-baseline gap-2">
      <span className="text-xs uppercase text-zinc-500">{label}</span>
      <span className={mono ? 'whitespace-pre-wrap break-all font-mono text-xs' : ''}>
        {value || '—'}
      </span>
    </div>
  )
}
