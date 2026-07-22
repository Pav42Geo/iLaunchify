// Partner orders — dispatch inbox.
//
// Partner-v2 surface (Pavel 2026-06-05): same interface as /products — cream
// hero + KPI strip + URL-driven status filter chips + sortable table. Replaces
// the old grouped-section list. Data wiring unchanged (last 50 dispatches).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn, ViewToggle, type ViewMode } from '@ilaunchify/ui'
import Link from 'next/link'
import {
  Inbox,
  Truck,
  ArrowUpDown,
  Eye,
  LifeBuoy,
  ClipboardList,
  Coffee,
  Leaf,
  Package,
  ArrowDownToLine,
  type LucideIcon,
} from 'lucide-react'
import { OrderRowActions } from './OrderRowActions'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'
import { serviceOwnedBy } from '@/lib/partner-context'
import { getPartnerRoleWord } from '@/lib/partner-role'
import { PageTabs } from '@/components/PageTabs'
import { QuickShipButton } from './QuickShipButton'
import { ListTitleRow } from '@/components/list-kit'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders — Partners' }

type Tab = 'all' | 'awaiting' | 'production' | 'ready' | 'transit' | 'delivered'

const TAB_STATUSES: Record<Exclude<Tab, 'all'>, string[]> = {
  awaiting: ['PENDING_ACCEPT'],
  production: ['ACCEPTED', 'PRODUCING'],
  ready: ['READY'],
  transit: ['SHIPPED', 'IN_TRANSIT'],
  delivered: ['DELIVERED'],
}
const TAB_LABEL: Record<Tab, string> = {
  all: 'All',
  awaiting: 'Awaiting',
  production: 'In production',
  ready: 'Ready to ship',
  transit: 'In transit',
  delivered: 'Delivered',
}
type SortKey = 'date' | 'amount'

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  PENDING_ACCEPT: { label: 'Awaiting', cls: 'border-pink-200 bg-pink-50 text-pink-800' },
  ACCEPTED: { label: 'Accepted', cls: 'border-info-200 bg-info-50 text-info-800' },
  PRODUCING: { label: 'Producing', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
  READY: { label: 'Ready', cls: 'border-success-200 bg-success-50 text-success-800' },
  SHIPPED: { label: 'Shipped', cls: 'border-info-200 bg-info-50 text-info-800' },
  IN_TRANSIT: { label: 'In transit', cls: 'border-info-200 bg-info-50 text-info-800' },
  DELIVERED: { label: 'Delivered', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
}

function isTab(s: string | undefined): s is Tab {
  return !!s && s in TAB_LABEL
}
function buildHref(p: { tab?: Tab; sort?: SortKey; dir?: 'asc' | 'desc'; view?: ViewMode }): string {
  const q = new URLSearchParams()
  if (p.tab && p.tab !== 'all') q.set('tab', p.tab)
  if (p.sort && p.sort !== 'date') q.set('sort', p.sort)
  if (p.dir && p.dir !== 'desc') q.set('dir', p.dir)
  if (p.view === 'table') q.set('view', p.view)
  const s = q.toString()
  return s ? `/orders?${s}` : '/orders'
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string; view?: string }>
}) {
  const sp = await searchParams
  const roleWord = await getPartnerRoleWord()
  const tab: Tab = isTab(sp.tab) ? sp.tab : 'all'
  const sort: SortKey = sp.sort === 'amount' ? 'amount' : 'date'
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc'
  const view: ViewMode = sp.view === 'table' ? 'table' : 'cards' // Partner default: cards (mirror creator)

  const user = await requireUser()
  // P3 multi-seat: dispatch inbox scoped to the services THIS USER may work
  // (admins = all of the org's services; members = their granted services).
  const services = await prisma.partnerService.findMany({
    where: { AND: [serviceOwnedBy(user.id)] },
    include: {
      dispatches: {
        include: {
          order: {
            include: {
              brand: true,
              items: {
                take: 1,
                include: { product: { select: { name: true, primaryImageAssetId: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })
  if (services.length === 0) return null

  const allRaw = services.flatMap((s) =>
    s.dispatches.map((d) => ({ ...d, serviceType: s.type })),
  )

  // C2.2 partner tagging (CHANNEL_MANAGEMENT_SPEC §3.4): a channel-origin
  // on-demand dispatch is made to order for ONE consumer, so the inbox flags it.
  // Resolution: ChannelOrder.productionOrderId soft back-ref (cast-guarded),
  // with the router's internalNotes marker as the pre-push / multi-order
  // fallback. Best-effort: a lookup failure just renders untagged rows.
  const channelByOrderId = new Map<string, string>()
  try {
    const orderIds = [...new Set(allRaw.map((d) => d.order.id))]
    const channelRows = orderIds.length
      ? await (
          prisma as unknown as {
            channelOrder?: {
              findMany: (a: unknown) => Promise<
                Array<{ productionOrderId: string | null; connection: { channel: { displayName: string | null; code: string } } }>
              >
            }
          }
        ).channelOrder?.findMany({
          where: { productionOrderId: { in: orderIds } },
          select: {
            productionOrderId: true,
            connection: { select: { channel: { select: { displayName: true, code: true } } } },
          },
        })
      : []
    for (const r of channelRows ?? []) {
      if (r.productionOrderId) {
        channelByOrderId.set(r.productionOrderId, r.connection.channel.displayName ?? r.connection.channel.code)
      }
    }
  } catch {
    /* untagged rows are correct rows */
  }
  const all = allRaw.map((d) => ({
    ...d,
    channelTag:
      channelByOrderId.get(d.order.id) ??
      (((d.order as { internalNotes?: string | null }).internalNotes ?? '').includes('ORIGIN: CHANNEL') ? 'Channel' : null),
  }))

  const countFor = (t: Exclude<Tab, 'all'>) => all.filter((d) => TAB_STATUSES[t].includes(d.status as string)).length

  const visible = (
    tab === 'all' ? all : all.filter((d) => TAB_STATUSES[tab].includes(d.status as string))
  ).slice()
  visible.sort((a, b) => {
    const flip = dir === 'asc' ? 1 : -1
    if (sort === 'amount') return (a.costCents - b.costCents) * flip
    return (a.createdAt.getTime() - b.createdAt.getTime()) * flip
  })

  // Resolve the order's product image (primaryImageAssetId) → displayable URL.
  const imgMap = await resolveCertBadgeUrls(
    visible.map((d) => d.order.items[0]?.product.primaryImageAssetId ?? null),
  )

  return (
    <div className="space-y-6">
      {/* FC partners work Receiving → Stock → Shipping as tabs of Orders
          (Pavel 2026-07-14); everyone else sees the plain dispatch inbox. */}
      {services.some((s) => (s.type as string) === 'WAREHOUSE') && <PageTabs group="orders" />}
      {/* Modern list chrome (Pavel 2026-07-14): slim title row + quiet stat
          strip replace the cream hero + KPI cards. Cells still link to their
          filter tabs — the old KPI→filter behavior survives. */}
      <ListTitleRow
        title="Orders"
        sub={`${all.length} dispatch${all.length === 1 ? '' : 'es'} in the last 50 events · ${roleWord}`}
      />

      {/* Status filter chips + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => {
            const c = t === 'all' ? all.length : countFor(t as Exclude<Tab, 'all'>)
            if (t !== 'all' && c === 0 && tab !== t) return null
            return (
              <Link
                key={t}
                href={buildHref({ tab: t, sort, dir, view })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                  tab === t ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
                )}
              >
                {TAB_LABEL[t]}
                <span className={cn('tabular-nums', tab === t ? 'text-white/70' : 'text-ink-400')}>{c}</span>
              </Link>
            )
          })}
        </div>
        <ViewToggle value={view} defaultMode="cards" />
      </div>

      {/* Table / cards */}
      {all.length === 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
            <Inbox className="h-6 w-6 text-pink-700" aria-hidden="true" />
          </div>
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">No dispatches yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            Once a creator publishes a product that matches your capabilities, dispatches appear
            here for acceptance.
          </p>
        </section>
      ) : view === 'cards' ? (
        <OrderCards rows={visible} tabLabel={TAB_LABEL[tab]} imgMap={imgMap} />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-[10.5px] uppercase tracking-[0.06em] text-ink-400">
                  <th className="px-5 py-2.5 font-semibold">Order</th>
                  <th className="px-3 py-2.5 font-semibold">Brand</th>
                  <th className="px-3 py-2.5 font-semibold">Service</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <SortTh label="Amount" k="amount" sort={sort} dir={dir} tab={tab} />
                  <SortTh label="Date" k="date" sort={sort} dir={dir} tab={tab} />
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-[12px] text-ink-500">
                      Nothing in “{TAB_LABEL[tab]}”.
                    </td>
                  </tr>
                )}
                {visible.map((d) => {
                  const pill = STATUS_PILL[d.status as string] ?? { label: d.status, cls: 'border-ink-200 bg-ink-100 text-ink-700' }
                  return (
                    <tr key={d.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                      <td className="px-5 py-3 font-mono text-[11.5px] text-ink-700">{(d.order as { orderNumber?: string | null }).orderNumber ?? `#${d.order.id.slice(-8)}`}</td>
                      <td className="px-3 py-3 font-medium text-ink-900">{d.order.brand.name}</td>
                      <td className="px-3 py-3 text-[12px] text-ink-600">
                        {d.type} · {d.serviceType}
                        {d.channelTag && <ChannelBadge tag={d.channelTag} />}
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', pill.cls)}>
                          {pill.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-ink-700">${(d.costCents / 100).toFixed(2)}</td>
                      <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                        {d.status === 'PENDING_ACCEPT'
                          ? `by ${new Date(d.acceptDeadlineAt).toLocaleDateString()}`
                          : new Date(d.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {/* Etsy-pattern quick-ship (Pavel 2026-07-14) — READY rows only. */}
                          {d.status === 'READY' && (
                            <QuickShipButton dispatchId={d.id} label={(d.order as { orderNumber?: string | null }).orderNumber ? `Order ${(d.order as { orderNumber?: string | null }).orderNumber}` : 'This dispatch'} />
                          )}
                          <OrderRowActions dispatchId={d.id} orderId={d.order.id} orderNumber={(d.order as { orderNumber?: string | null }).orderNumber} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Card view (?view=cards)
// -----------------------------------------------------------------------------

type DispatchRow = {
  id: string
  type: string
  serviceType: string
  /** C2.2: non-null = channel-origin on-demand dispatch (value = channel name). */
  channelTag: string | null
  status: string
  costCents: number
  createdAt: Date
  acceptDeadlineAt: Date
  manifestVersion: number
  order: {
    id: string
    brand: { name: string }
    items: { product: { name: string; primaryImageAssetId: string | null } }[]
  }
}

function OrderCards({
  rows,
  tabLabel,
  imgMap,
}: {
  rows: DispatchRow[]
  tabLabel: string
  imgMap: Map<string, string>
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-ink-200 bg-white px-6 py-8 text-center text-[12px] text-ink-500">
        Nothing in “{tabLabel}”.
      </section>
    )
  }
  return (
    <div className="space-y-4">
      {rows.map((d) => (
        <PartnerOrderCard key={d.id} d={d} imgMap={imgMap} />
      ))}
    </div>
  )
}

// Rich dispatch card mirroring the creator OrderCard chrome: cream header band
// (status + order ref + Manifest link + amount), a body with product thumbnail +
// meta + phase bar, and a footer action rail with the "Get order support" entry.
function PartnerOrderCard({ d, imgMap }: { d: DispatchRow; imgMap: Map<string, string> }) {
  const pill = STATUS_PILL[d.status] ?? { label: d.status, cls: 'border-ink-200 bg-ink-100 text-ink-700' }
  const pending = d.status === 'PENDING_ACCEPT'
  const product = d.order.items[0]?.product
  const title = product?.name ?? d.order.brand.name
  const imageUrl = product?.primaryImageAssetId ? imgMap.get(product.primaryImageAssetId) : undefined
  const dateLabel = pending
    ? `Accept by ${new Date(d.acceptDeadlineAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : `Placed ${new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-ink-200 bg-[var(--bg-hero)] px-4 py-2.5 text-[12px] text-ink-700">
        <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', pill.cls)}>
          {pill.label}
        </span>
        {d.channelTag && <ChannelBadge tag={d.channelTag} />}
        <span>
          <span className="text-ink-500">Order</span> <span className="font-mono text-[11.5px]">{(d.order as { orderNumber?: string | null }).orderNumber ?? `#${d.order.id.slice(-8)}`}</span>
        </span>
        <Link
          href={`/orders/${d.id}#manifest`}
          className="inline-flex items-center gap-1 font-medium text-pink-700 hover:underline"
        >
          <ClipboardList className="h-3.5 w-3.5" /> Manifest v{d.manifestVersion}
        </Link>
        <Link
          href="/payments"
          className="inline-flex items-center gap-1 font-medium text-pink-700 hover:underline"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" /> Payout
        </Link>
        <span className="ml-auto font-display text-[15px] font-bold tabular-nums text-ink-900">
          ${(d.costCents / 100).toFixed(2)}
        </span>
      </header>

      <div className="flex items-start gap-4 px-4 pb-3 pt-4">
        <CardThumb name={title} imageUrl={imageUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium leading-tight text-ink-900">{title}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-500">
            {d.order.brand.name} · {d.type} · {d.serviceType}
            {d.channelTag && <span className="text-info-700"> · ships direct to the consumer</span>}
          </div>
          <div className={cn('mt-1 text-[11.5px] tabular-nums', pending ? 'font-medium text-pink-700' : 'text-ink-500')}>
            {dateLabel}
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center gap-1 text-[12px] uppercase tracking-[0.05em] text-ink-700">
              {(['Accept', 'Production', 'Shipping', 'Delivered'] as const).map((lbl, i) => (
                <span key={lbl} className={i + 1 <= dispatchPhase(d.status) ? 'text-ink-700' : ''}>
                  {lbl}
                  {i < 3 && <span className="mx-1 text-ink-300">·</span>}
                </span>
              ))}
            </div>
            <PhaseBar phase={dispatchPhase(d.status)} />
          </div>
        </div>
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-200 bg-[var(--bg-hero)] px-4 py-2.5 text-[12px]">
        <ActionLink href={`/orders/${d.id}`} icon={Eye}>
          Open dispatch
        </ActionLink>
        <Sep />
        <ActionLink href={`/help/new?category=order-issue&dispatchId=${d.id}`} icon={LifeBuoy}>
          Get order support
        </ActionLink>
        <span className="ml-auto inline-flex items-center gap-2">
          {/* Etsy-pattern quick-ship (Pavel 2026-07-14) — READY cards only. */}
          {d.status === 'READY' && (
            <QuickShipButton dispatchId={d.id} label={(d.order as { orderNumber?: string | null }).orderNumber ? `Order ${(d.order as { orderNumber?: string | null }).orderNumber}` : 'This dispatch'} />
          )}
          <OrderRowActions dispatchId={d.id} orderId={d.order.id} orderNumber={(d.order as { orderNumber?: string | null }).orderNumber} />
        </span>
      </footer>
    </article>
  )
}

// Dispatch lifecycle → 4 phases, mirroring the creator card's phase bar.
function dispatchPhase(status: string): number {
  if (status === 'DELIVERED') return 4
  if (['READY', 'SHIPPED', 'IN_TRANSIT'].includes(status)) return 3
  if (['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK'].includes(status)) return 2
  return 1 // PENDING_ACCEPT (+ anything earlier)
}

function PhaseBar({ phase }: { phase: number }) {
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full" role="progressbar">
      {[1, 2, 3, 4].map((n) => {
        const filled = n <= phase
        const isLast = n === phase
        return (
          <div
            key={n}
            className="flex-1"
            style={{
              background: filled ? (isLast && phase < 4 ? '#BA7517' : '#0F6E56') : '#F1EFE8',
            }}
          />
        )
      })}
    </div>
  )
}

// Real product image when available; otherwise a deterministic gradient + icon
// (matching the creator card's image-less thumbnail style).
function CardThumb({ name, imageUrl }: { name: string; imageUrl?: string }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className="h-12 w-12 flex-none rounded-xl object-cover ring-1 ring-ink-100"
      />
    )
  }
  const gradients = [
    'linear-gradient(135deg,#F4C0D1 0%,#D4537E 100%)',
    'linear-gradient(135deg,#9FE1CB 0%,#0F6E56 100%)',
    'linear-gradient(135deg,#FAC775 0%,#BA7517 100%)',
    'linear-gradient(135deg,#CECBF6 0%,#534AB7 100%)',
  ]
  const icons = [Coffee, Leaf, Package, Truck]
  const h = simpleHash(name)
  const Icon = icons[h % icons.length]!
  return (
    <div
      className="flex h-12 w-12 flex-none items-center justify-center rounded-xl"
      style={{ background: gradients[h % gradients.length] }}
    >
      <Icon className="h-5 w-5 text-white" aria-hidden="true" />
    </div>
  )
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function ActionLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 font-medium text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </Link>
  )
}

function Sep() {
  return <span className="text-ink-300">·</span>
}

/** C2.2 - channel-origin on-demand marker (spec §3.4: "tagged Channel · On-Demand").
 *  `tag` is the channel's display name; the generic 'Channel' fallback comes from
 *  the internalNotes marker when the ChannelOrder back-ref can't be resolved. */
function ChannelBadge({ tag }: { tag: string }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-info-200 bg-info-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-info-800">
      <Truck className="h-3 w-3" aria-hidden="true" />
      Channel · On-Demand{tag !== 'Channel' ? ` · ${tag}` : ''}
    </span>
  )
}

// -----------------------------------------------------------------------------


function SortTh({
  label,
  k,
  sort,
  dir,
  tab,
}: {
  label: string
  k: SortKey
  sort: SortKey
  dir: 'asc' | 'desc'
  tab: Tab
}) {
  const isActive = sort === k
  const nextDir = isActive && dir === 'desc' ? 'asc' : 'desc'
  return (
    <th className="px-3 py-2.5 font-semibold">
      <Link
        href={buildHref({ tab, sort: k, dir: nextDir })}
        className={cn(
          'inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
          isActive ? 'text-ink-900' : 'hover:text-ink-700',
        )}
      >
        {label}
        <ArrowUpDown className={cn('h-3 w-3', isActive ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
      </Link>
    </th>
  )
}
