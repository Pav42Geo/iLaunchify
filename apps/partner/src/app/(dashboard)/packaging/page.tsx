// Partner Packaging Catalog — list view.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md + task #128.
//
// Shows every PackagingSystem owned by the current partner, grouped by
// status (Active first, then Draft, then Retired). Each row links to the
// edit page where the partner manages core fields + surfaces.
//
// V1 admin-curated PackagingType library is empty at launch; partners
// always create from scratch. As the library grows (#135 promotion queue),
// new packaging systems will auto-link via the picker on the New page.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from '@ilaunchify/ui'
import { Plus, Box } from 'lucide-react'
import { STATUS_LABELS, topologyLabel } from './constants'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packaging — iLaunchify Partners' }

export default async function PackagingListPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      packagingSystems: {
        include: { _count: { select: { surfaces: true } } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      },
    },
  })

  if (!partner) return null

  // Group by status so admin queue mirrors what creator sees on marketplace
  const active = partner.packagingSystems.filter((s) => s.status === 'ACTIVE')
  const drafts = partner.packagingSystems.filter((s) => s.status === 'DRAFT')
  const retired = partner.packagingSystems.filter((s) => s.status === 'RETIRED')

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Packaging catalog</h1>
          <p className="mt-1 text-sm text-zinc-500">
            The packaging you offer. Each system lists one SKU&apos;s worth of physical
            packaging (a 16oz jar, a 12oz can, a stick pack, etc.). Active items are visible
            to creators when they pick packaging for a product.
          </p>
        </div>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/packaging/new">
            <Plus className="mr-1.5 h-4 w-4" /> Add packaging
          </Link>
        </Button>
      </header>

      {partner.packagingSystems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-emerald-50 p-3">
              <Box className="h-7 w-7 text-emerald-600" />
            </div>
            <CardTitle className="text-base">No packaging yet</CardTitle>
            <CardDescription className="max-w-md text-sm">
              Add your first packaging system so creators can pick it when customizing a
              product. You can save drafts and activate them when ready.
            </CardDescription>
            <Button asChild className="mt-2 bg-emerald-600 hover:bg-emerald-700">
              <Link href="/packaging/new">
                <Plus className="mr-1.5 h-4 w-4" /> Add your first
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <Section title="Active" count={active.length}>
              <PackagingTable rows={active} />
            </Section>
          )}
          {drafts.length > 0 && (
            <Section title="Drafts" count={drafts.length}>
              <PackagingTable rows={drafts} />
            </Section>
          )}
          {retired.length > 0 && (
            <Section title="Retired" count={retired.length}>
              <PackagingTable rows={retired} />
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-3">
        <CardTitle className="text-base">
          {title} <span className="ml-2 text-sm font-normal text-zinc-500">{count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}

import type { PackagingTopology, PackagingStatus } from '@prisma/client'

type Row = {
  id: string
  partnerName: string
  topology: PackagingTopology
  status: PackagingStatus
  unitCount: number
  moq: number
  _count: { surfaces: number }
}

function PackagingTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-t border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500">
            <th className="px-6 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Topology</th>
            <th className="px-3 py-2 font-medium">Units / pack</th>
            <th className="px-3 py-2 font-medium">MOQ</th>
            <th className="px-3 py-2 font-medium">Surfaces</th>
            <th className="px-6 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const badge = STATUS_LABELS[r.status] ?? { label: r.status, cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' }
            return (
              <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="px-6 py-3">
                  <div className="font-medium text-zinc-900">{r.partnerName}</div>
                  <div className="mt-0.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-zinc-700">{topologyLabel(r.topology)}</td>
                <td className="px-3 py-3 text-zinc-700">{r.unitCount}</td>
                <td className="px-3 py-3 text-zinc-700">{r.moq.toLocaleString()}</td>
                <td className="px-3 py-3 text-zinc-700">{r._count.surfaces}</td>
                <td className="px-6 py-3 text-right">
                  <Link
                    href={`/packaging/${r.id}`}
                    className="text-sm font-medium text-emerald-700 hover:underline"
                  >
                    Edit →
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
