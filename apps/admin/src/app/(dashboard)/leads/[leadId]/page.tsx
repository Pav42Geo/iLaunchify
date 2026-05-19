import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { notFound } from 'next/navigation'
import { LeadActions } from './LeadActions'

export const dynamic = 'force-dynamic'

export default async function LeadDetail({ params }: { params: Promise<{ leadId: string }> }) {
  const lead = await prisma.partner.findUnique({
    where: { id: (await params).leadId },
    include: { user: true, services: true },
  })
  if (!lead) notFound()

  let notes: Record<string, unknown> = {}
  try {
    notes = JSON.parse(lead.leadNotes ?? '{}')
  } catch {
    notes = { raw: lead.leadNotes }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{lead.companyName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {lead.user.email} · submitted {new Date(lead.createdAt).toLocaleString()} · status{' '}
          <span className="font-medium">{lead.status}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr,300px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Legal name" value={lead.legalName} />
              <Row label="Website" value={lead.websiteUrl} />
              <Row label="Contact phone" value={lead.contactPhone} />
              <Row label="Country" value={lead.country} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application notes</CardTitle>
              <CardDescription>Submitted via /partners/apply</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(notes).map(([k, v]) => (
                <Row key={k} label={k} value={String(v ?? '—')} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Services declared</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.services.map((s) => (
                <div key={s.id} className="rounded-md border border-zinc-200 p-3">
                  <div className="font-medium">{s.type}</div>
                  <div className="text-xs text-zinc-500">
                    Status: {s.status} · Disclosure: {s.disclosureLevel}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div>
          <LeadActions leadId={lead.id} currentStatus={lead.status} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[140px,1fr] items-baseline gap-2">
      <span className="text-xs uppercase text-zinc-500">{label}</span>
      <span>{value || '—'}</span>
    </div>
  )
}
