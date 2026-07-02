// Creator → Channels → Orders inbox (CHANNEL_MANAGEMENT_SPEC §3.4, C2.1).
// Imported consumer orders with status chips (needs-attention / on-hold /
// manual-confirm queue), Sync-now, and approve for held orders. Routing READY
// orders into production (auto-billing + dispatch) lands in C2.2.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ChannelOrdersClient, type ChannelOrderRow } from './ChannelOrdersClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channel orders — iLaunchify' }

type OrderRowRaw = {
  id: string
  externalOrderId: string
  status: string
  statusReason: string | null
  financialStatus: string
  totalPrice: unknown
  currency: string
  placedAt: Date
  manualConfirmRequired: boolean
  connection: { channel: { displayName: string; code: string } }
  lines: Array<{ title: string | null; quantity: number }>
}

export default async function ChannelOrdersPage() {
  const user = await requireUser()
  const delegate = (prisma as unknown as { channelOrder?: { findMany: (a: unknown) => Promise<OrderRowRaw[]> } }).channelOrder
  const rows: OrderRowRaw[] = delegate
    ? await delegate
        .findMany({
          where: { connection: { creatorUserId: user.id } },
          include: {
            connection: { select: { channel: { select: { displayName: true, code: true } } } },
            lines: { select: { title: true, quantity: true } },
          },
          orderBy: { placedAt: 'desc' },
          take: 100,
        })
        .catch(() => [])
    : []

  const orders: ChannelOrderRow[] = rows.map((r) => ({
    id: r.id,
    externalOrderId: r.externalOrderId,
    channel: r.connection.channel.displayName,
    status: r.status,
    statusReason: r.statusReason,
    financialStatus: r.financialStatus,
    total: `${r.currency} ${String(r.totalPrice)}`,
    placedAtIso: r.placedAt.toISOString(),
    manualConfirmRequired: r.manualConfirmRequired,
    itemSummary: r.lines.map((l) => `${l.quantity}× ${l.title ?? 'item'}`).join(', '),
  }))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Channel orders</h1>
        <p className="mt-1 text-[13.5px] text-ink-600">
          Consumer orders imported from your connected channels. Ready orders route to production automatically
          {' '}— held orders tell you exactly why.
        </p>
      </div>
      <ChannelOrdersClient initial={orders} migrated={!!delegate} />
    </div>
  )
}
