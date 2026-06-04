// Track C / C7.j — Partner accessories catalog (list view).
//
// Every AccessoryOffering the partner has listed (engraved spoons, ribbons,
// recipe cards, …), scoped via the partner's own PartnerService ids (the
// partnerServiceId soft FK). Creators bundle these onto products at checkout
// (C7.l); admin verifies new ones (C7.k). v2-style surface: KPI strip + plain
// table + RowActionsMenu.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { Button, KpiWidget } from '@ilaunchify/ui'
import { Plus, Gift, Clock3, CheckCircle2, Archive } from 'lucide-react'
import { AccessoryRowActions } from './AccessoryRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accessories — iLaunchify Partners' }

const CATEGORY_LABEL: Record<string, string> = {
  SPOON: 'Spoon',
  RIBBON: 'Ribbon',
  TAG: 'Tag',
  INSERT: 'Insert',
  CAP_COVER: 'Cap cover',
  TISSUE: 'Tissue',
  WAX_SEAL: 'Wax seal',
  STICKER_PACK: 'Sticker pack',
  OTHER: 'Other',
}

const STATUS_BADGE: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  ARCHIVED: 'bg-zinc-100 text-zinc-500',
  DRAFT: 'bg-zinc-100 text-zinc-600',
}

function centsLabel(tiers: unknown): string {
  const first = Array.isArray(tiers) ? (tiers[0] as { pricePerUnit?: number } | undefined) : undefined
  const p = first?.pricePerUnit
  return typeof p === 'number' ? `$${p.toFixed(2)}/unit` : '—'
}

export default async function AccessoriesListPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, services: { select: { id: true } } },
  })
  if (!partner) return null
  const serviceIds = partner.services.map((s) => s.id)

  const offerings = await prisma.accessoryOffering.findMany({
    where: { partnerServiceId: { in: serviceIds } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  const rows = await Promise.all(
    offerings.map(async (o) => ({
      ...o,
      imageUrl: o.imageFileKey
        ? await getSignedReadUrl(o.imageFileKey, { expiresInSeconds: 60 * 30 }).catch(() => null)
        : null,
    })),
  )

  const total = rows.length
  const pending = rows.filter((r) => r.status === 'PENDING_REVIEW').length
  const active = rows.filter((r) => r.status === 'ACTIVE').length
  const archived = rows.filter((r) => r.status === 'ARCHIVED').length
  const categories = new Set(rows.map((r) => r.category)).size

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accessories</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Branded add-ons creators can bundle onto your products — they ship with your fulfillment.
          </p>
        </div>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/accessories/new">
            <Plus className="mr-1.5 h-4 w-4" /> Add accessory
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiWidget label="Total" value={total} icon={Gift} tone="ink" />
        <KpiWidget label="Pending review" value={pending} icon={Clock3} tone="warning" />
        <KpiWidget label="Active" value={active} icon={CheckCircle2} tone="success" />
        <KpiWidget label="Archived" value={archived} icon={Archive} tone="ink" />
        <KpiWidget label="Categories" value={categories} icon={Gift} tone="info" />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
            <Gift className="h-5 w-5 text-zinc-400" />
          </span>
          <p className="text-sm text-zinc-500">
            No accessories yet. List engraved spoons, ribbons, recipe cards and more for creators to bundle.
          </p>
          <Button asChild variant="outline">
            <Link href="/accessories/new">
              <Plus className="mr-1.5 h-4 w-4" /> Add your first accessory
            </Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-2.5 font-semibold">Accessory</th>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-4 py-2.5 font-semibold">MOQ</th>
                <th className="px-4 py-2.5 font-semibold">Lead</th>
                <th className="px-4 py-2.5 font-semibold">Price</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {r.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.imageUrl}
                          alt=""
                          className="h-9 w-9 flex-shrink-0 rounded-md border border-zinc-200 bg-white object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50">
                          <Gift className="h-4 w-4 text-zinc-300" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-900">{r.name}</div>
                        {r.isCustomizable && (
                          <div className="text-[11px] text-pink-700">Customizable</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{r.moq}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{r.leadTimeDays}d</td>
                  <td className="px-4 py-2.5 text-zinc-600">{centsLabel(r.pricingTiers)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[r.status] ?? 'bg-zinc-100 text-zinc-600'}`}
                    >
                      {r.status.replace('_', ' ').toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <AccessoryRowActions id={r.id} name={r.name} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
