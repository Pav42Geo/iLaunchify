import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leads — Admin' }

export default async function LeadsPage() {
  // Leads = Partners in DRAFT or INVITED status (haven't completed onboarding)
  const leads = await prisma.partner.findMany({
    where: { status: { in: ['DRAFT', 'INVITED'] } },
    include: { user: true, services: true },
    orderBy: { createdAt: 'desc' },
  })

  const drafts = leads.filter((l) => l.status === 'DRAFT')
  const invited = leads.filter((l) => l.status === 'INVITED')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {drafts.length} pending review · {invited.length} invited (awaiting onboarding)
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Pending review
        </h2>
        {drafts.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inbox zero</CardTitle>
              <CardDescription>No new applications.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-3">
            {drafts.map((lead) => (
              <li key={lead.id}>
                <Link href={`/leads/${lead.id}`}>
                  <Card className="transition-colors hover:bg-zinc-50">
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-base">{lead.companyName}</CardTitle>
                        <CardDescription>
                          {lead.services.map((s) => s.type).join(', ')} · {lead.user.email}
                          {lead.websiteUrl && (
                            <>
                              {' · '}
                              <span className="text-brand-primary">{lead.websiteUrl}</span>
                            </>
                          )}
                        </CardDescription>
                      </div>
                      <div className="text-sm text-zinc-500">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invited.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Invited (waiting to complete onboarding)
          </h2>
          <ul className="space-y-3">
            {invited.map((lead) => (
              <li key={lead.id}>
                <Link href={`/leads/${lead.id}`}>
                  <Card className="transition-colors hover:bg-zinc-50">
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-base">{lead.companyName}</CardTitle>
                        <CardDescription>
                          Invited {new Date(lead.updatedAt).toLocaleDateString()} · {lead.user.email}
                        </CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
