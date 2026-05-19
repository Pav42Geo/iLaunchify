import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders — Partners' }

const SECTIONS = [
  { status: ['PENDING_ACCEPT'], label: 'Awaiting your acceptance', deadline: true },
  { status: ['ACCEPTED', 'PRODUCING'], label: 'In production' },
  { status: ['READY'], label: 'Ready to ship' },
  { status: ['SHIPPED', 'IN_TRANSIT'], label: 'In transit' },
  { status: ['DELIVERED'], label: 'Delivered' },
]

export default async function OrdersPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: {
        include: {
          dispatches: {
            include: { order: { include: { brand: true } } },
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      },
    },
  })
  if (!partner) return null

  const allDispatches = partner.services.flatMap((s) =>
    s.dispatches.map((d) => ({ ...d, serviceType: s.type })),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {allDispatches.length} dispatches in the last 50 events
        </p>
      </div>

      {allDispatches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No dispatches yet</CardTitle>
            <CardDescription>
              Real order routing comes online in Week 8. Once a creator publishes a product that
              matches your capabilities, dispatches appear here for acceptance.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        SECTIONS.map(({ status, label, deadline }) => {
          const items = allDispatches.filter((d) => status.includes(d.status as never))
          if (items.length === 0) return null
          return (
            <section key={label}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {label} ({items.length})
              </h2>
              <ul className="space-y-2">
                {items.map((d) => (
                  <li key={d.id}>
                    <Link href={`/orders/${d.id}`}>
                      <Card className="transition-colors hover:bg-zinc-50">
                        <CardHeader className="flex-row items-center justify-between space-y-0">
                          <div>
                            <CardTitle className="text-base">
                              {d.type} · {d.order.brand.name}
                            </CardTitle>
                            <CardDescription>
                              Order #{d.order.id.slice(-8)} · ${(d.costCents / 100).toFixed(2)} · {d.serviceType}
                            </CardDescription>
                          </div>
                          {deadline && (
                            <div className="text-xs text-amber-700">
                              Respond by {new Date(d.acceptDeadlineAt).toLocaleString()}
                            </div>
                          )}
                        </CardHeader>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
