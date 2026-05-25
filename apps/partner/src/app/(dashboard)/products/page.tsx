// Partner products list — every ProductTemplate owned by this partner.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4 + #130.
//
// Grouped by status (Published / In review / Drafts / Needs changes / Archived)
// so the most-actionable rows surface first.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import { Plus, Package } from 'lucide-react'
import type { ProductTemplateStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Products — iLaunchify Partners' }

const STATUS_BADGE: Partial<Record<ProductTemplateStatus, { label: string; cls: string }>> = {
  PUBLISHED: { label: 'Live', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  PENDING_REVIEW: { label: 'In review', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  PENDING_EDIT_REVIEW: { label: 'Edits in review', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  NEEDS_CHANGES: { label: 'Needs changes', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  REJECTED: { label: 'Archived', cls: 'bg-red-100 text-red-800 ring-red-200' },
  UNDER_REVIEW: { label: 'Under review (legacy)', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  ARCHIVED: { label: 'Archived (legacy)', cls: 'bg-red-100 text-red-800 ring-red-200' },
}

export default async function ProductsListPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: { where: { type: 'MANUFACTURING' }, select: { id: true } },
    },
  })
  if (!partner) return null

  const serviceIds = partner.services.map((s) => s.id)

  // Templates owned via PartnerService (MANUFACTURING)
  const templates = serviceIds.length
    ? await prisma.productTemplate.findMany({
        where: { manufacturerServiceId: { in: serviceIds } },
        include: {
          subcategory: { select: { name: true } },
          _count: {
            select: {
              ingredientSlots: true,
              packagingSystems: true,
              variants: true,
            },
          },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      })
    : []

  const grouped = groupByStatus(templates)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-zinc-500">
            ProductTemplates you offer. Published templates appear in the creator marketplace
            and can be customized + ordered.
          </p>
        </div>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/products/new">
            <Plus className="mr-1.5 h-4 w-4" /> New product
          </Link>
        </Button>
      </header>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-emerald-50 p-3">
              <Package className="h-7 w-7 text-emerald-600" />
            </div>
            <CardTitle className="text-base">No products yet</CardTitle>
            <CardDescription className="max-w-md text-sm">
              A 4-step stepper walks you through your first product (what it is, what&apos;s
              in it, how it ships, and what it costs). You can save as a draft and refine
              later — admin only reviews when you click Submit.
            </CardDescription>
            <Button asChild className="mt-2 bg-emerald-600 hover:bg-emerald-700">
              <Link href="/products/new">
                <Plus className="mr-1.5 h-4 w-4" /> Create your first
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ status, rows }) => (
            <ProductSection key={status} status={status} rows={rows} />
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Render — sectioned list
// -----------------------------------------------------------------------------

type Row = {
  id: string
  name: string
  status: ProductTemplateStatus
  subcategory: { name: string }
  priceFloorCents: number
  updatedAt: Date
  _count: { ingredientSlots: number; packagingSystems: number; variants: number }
}

function groupByStatus(rows: Row[]): Array<{ status: ProductTemplateStatus; rows: Row[] }> {
  const order: ProductTemplateStatus[] = [
    'NEEDS_CHANGES',
    'DRAFT',
    'PENDING_REVIEW',
    'PENDING_EDIT_REVIEW',
    'PUBLISHED',
    'PAUSED',
    'REJECTED',
    'UNDER_REVIEW',
    'ARCHIVED',
  ]
  const buckets = new Map<ProductTemplateStatus, Row[]>()
  for (const r of rows) {
    const arr = buckets.get(r.status) ?? []
    arr.push(r)
    buckets.set(r.status, arr)
  }
  return order
    .filter((s) => buckets.has(s) && (buckets.get(s)?.length ?? 0) > 0)
    .map((status) => ({ status, rows: buckets.get(status)! }))
}

function ProductSection({ status, rows }: { status: ProductTemplateStatus; rows: Row[] }) {
  const badge = STATUS_BADGE[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${badge.cls}`}>
            {badge.label}
          </span>
          <span className="text-sm font-normal text-zinc-500">{rows.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-6 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Subcategory</th>
                <th className="px-3 py-2 font-medium">Slots</th>
                <th className="px-3 py-2 font-medium">Packaging</th>
                <th className="px-3 py-2 font-medium">Base price</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-6 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-6 py-3 font-medium text-zinc-900">{r.name}</td>
                  <td className="px-3 py-3 text-zinc-700">{r.subcategory.name}</td>
                  <td className="px-3 py-3 text-zinc-700">{r._count.ingredientSlots}</td>
                  <td className="px-3 py-3 text-zinc-700">{r._count.packagingSystems}</td>
                  <td className="px-3 py-3 text-zinc-700">
                    ${(r.priceFloorCents / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-500">
                    {new Date(r.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/products/${r.id}/edit`}
                      className="text-sm font-medium text-emerald-700 hover:underline"
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
