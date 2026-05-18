import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partners — Admin' }

const STATUS_ORDER = ['UNDER_REVIEW', 'ACTIVE', 'IN_PROGRESS', 'INVITED', 'SUSPENDED', 'DRAFT'] as const
const STATUS_LABELS: Record<string, string> = {
  UNDER_REVIEW: 'Awaiting your review',
  ACTIVE: 'Active',
  IN_PROGRESS: 'Onboarding in progress',
  INVITED: 'Invited',
  SUSPENDED: 'Suspended',
  DRAFT: 'Draft',
}

export default async function PartnersPage() {
  const partners = await prisma.partner.findMany({
    include: { user: true, services: true },
    orderBy: { updatedAt: 'desc' },
  })

  const grouped = STATUS_ORDER.reduce<Record<string, typeof partners>>((acc, status) => {
    acc[status] = partners.filter((p) => p.status === status)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partners</h1>
          <p className="mt-1 text-sm text-zinc-500">{partners.length} total</p>
        </div>
      </div>

      {STATUS_ORDER.map((status) => {
        const items = grouped[status]
        if (items.length === 0) return null
        return (
          <section key={status}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {STATUS_LABELS[status]} ({items.length})
            </h2>
            <ul className="space-y-2">
              {items.map((p) => (
                <li key={p.id}>
                  <Link href={`/partners/${p.id}`}>
                    <Card className="transition-colors hover:bg-zinc-50">
                      <CardHeader className="flex-row items-center justify-between space-y-0">
                        <div>
                          <CardTitle className="text-base">{p.companyName}</CardTitle>
                          <CardDescription>
                            {p.services.map((s) => s.type).join(', ') || 'No services'} · {p.user.email}
                            {p.city && (
                              <>
                                {' · '}
                                {p.city}, {p.state ?? p.country}
                              </>
                            )}
                          </CardDescription>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
