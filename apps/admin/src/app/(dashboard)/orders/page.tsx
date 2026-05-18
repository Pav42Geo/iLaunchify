import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders — Admin' }

const URGENT_STATUSES = ['ON_HOLD', 'DISPUTED', 'ROUTING'] as const

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    include: {
      brand: true,
      items: { include: { product: true } },
      dispatches: true,
      charge: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const urgent = orders.filter((o) => URGENT_STATUSES.includes(o.status as never))
  const recent = orders.filter((o) => !URGENT_STATUSES.includes(o.status as never))

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-zinc-500">{orders.length} of last 100</p>
      </div>

      {urgent.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-700">
            Needs attention ({urgent.length})
          </h2>
          <OrderList orders={urgent} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Recent ({recent.length})
        </h2>
        {recent.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No orders yet</CardTitle>
              <CardDescription>Orders appear here once consumers complete checkout.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <OrderList orders={recent} />
        )}
      </section>
    </div>
  )
}

function OrderList({ orders }: { orders: any[] }) {
  return (
    <ul className="space-y-2">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`}>
            <Card className="transition-colors hover:bg-zinc-50">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">
                    #{o.id.slice(-8)} · {o.brand.name}
                  </CardTitle>
                  <CardDescription>
                    {o.items[0]?.product.name ?? '—'} · ${(o.totalCents / 100).toFixed(2)} · {o.status}
                    {o.dispatches.length > 0 && (
                      <span className="ml-1">· {o.dispatches.length} dispatch(es)</span>
                    )}
                  </CardDescription>
                </div>
                <div className="text-sm text-zinc-500">
                  {new Date(o.createdAt).toLocaleString()}
                </div>
              </CardHeader>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}
