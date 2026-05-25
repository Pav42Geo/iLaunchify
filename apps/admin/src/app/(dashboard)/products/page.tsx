// Admin product review queue.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §8 + #133.
//
// Tabs (via ?tab= query):
//   new   — PENDING_REVIEW (first-time submissions, default)
//   edits — PENDING_EDIT_REVIEW (live products with proposed edits)
//   all   — every status, sorted by recently updated
//
// Each row links to /admin/products/[id] where admin reviews + decides.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ilaunchify/ui'
import { Package } from 'lucide-react'
import type { ProductTemplateStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Products — iLaunchify Admin' }

const TAB_LABELS = [
  { id: 'new', label: 'New submissions', status: ['PENDING_REVIEW', 'UNDER_REVIEW'] as ProductTemplateStatus[] },
  { id: 'edits', label: 'Edits in review', status: ['PENDING_EDIT_REVIEW'] as ProductTemplateStatus[] },
  { id: 'changes', label: 'Needs changes', status: ['NEEDS_CHANGES'] as ProductTemplateStatus[] },
  { id: 'live', label: 'Live', status: ['PUBLISHED'] as ProductTemplateStatus[] },
  { id: 'all', label: 'All', status: null as ProductTemplateStatus[] | null },
] as const

const STATUS_BADGE: Partial<Record<ProductTemplateStatus, { label: string; cls: string }>> = {
  PENDING_REVIEW: { label: 'Pending review', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  PENDING_EDIT_REVIEW: { label: 'Edits in review', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  NEEDS_CHANGES: { label: 'Needs changes', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  PUBLISHED: { label: 'Live', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-100 text-red-800 ring-red-200' },
  UNDER_REVIEW: { label: 'Under review (legacy)', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  ARCHIVED: { label: 'Archived (legacy)', cls: 'bg-red-100 text-red-800 ring-red-200' },
}

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function AdminProductsListPage({ searchParams }: PageProps) {
  const { tab: tabParam } = await searchParams
  const activeTab = TAB_LABELS.find((t) => t.id === tabParam) ?? TAB_LABELS[0]

  // Load counts for all tabs (one query — cheap on small data)
  const allCounts = await prisma.productTemplate.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  const countByStatus = new Map(allCounts.map((c) => [c.status, c._count._all]))

  // Active-tab rows
  const where = activeTab.status ? { status: { in: activeTab.status } } : {}
  const rows = await prisma.productTemplate.findMany({
    where,
    include: {
      subcategory: { select: { name: true, category: { select: { name: true } } } },
      manufacturerService: {
        select: { partner: { select: { id: true, companyName: true } } },
      },
      _count: {
        select: {
          ingredientSlots: true,
          packagingSystems: true,
          variants: true,
          reviewItems: { where: { resolved: false } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="mt-1 text-sm text-zinc-500">
          ProductTemplates submitted by partners. Review the contents, approve to publish,
          or send back with a checklist of changes.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TAB_LABELS.map((t) => {
          const count = t.status
            ? t.status.reduce((sum, s) => sum + (countByStatus.get(s) ?? 0), 0)
            : Array.from(countByStatus.values()).reduce((a, b) => a + b, 0)
          const isActive = t.id === activeTab.id
          return (
            <Link
              key={t.id}
              href={t.id === 'new' ? '/products' : `/products?tab=${t.id}`}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-emerald-500 text-emerald-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {count}
              </span>
            </Link>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-emerald-50 p-3">
              <Package className="h-7 w-7 text-emerald-600" />
            </div>
            <CardTitle className="text-base">Nothing to review</CardTitle>
            <CardDescription className="text-sm">
              The {activeTab.label.toLowerCase()} queue is empty right now.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{activeTab.label}</CardTitle>
            <CardDescription>{rows.length} item{rows.length === 1 ? '' : 's'}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500">
                    <th className="px-6 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Partner</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Composition</th>
                    <th className="px-3 py-2 font-medium">Open items</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-6 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const badge = STATUS_BADGE[r.status] ?? {
                      label: r.status,
                      cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
                    }
                    return (
                      <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                        <td className="px-6 py-3">
                          <div className="font-medium text-zinc-900">{r.name}</div>
                          <span
                            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-zinc-700">
                          {r.manufacturerService?.partner ? (
                            <Link
                              href={`/partners/${r.manufacturerService.partner.id}`}
                              className="hover:underline"
                            >
                              {r.manufacturerService.partner.companyName}
                            </Link>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-zinc-700">
                          {r.subcategory.category.name} · {r.subcategory.name}
                        </td>
                        <td className="px-3 py-3 text-xs text-zinc-600">
                          {r._count.ingredientSlots} ing · {r._count.packagingSystems} pkg ·{' '}
                          {r._count.variants} var
                        </td>
                        <td className="px-3 py-3 text-zinc-700">
                          {r._count.reviewItems > 0 ? (
                            <span className="text-amber-700">{r._count.reviewItems} open</span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-zinc-500">
                          {new Date(r.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <Link
                            href={`/products/${r.id}`}
                            className="text-sm font-medium text-emerald-700 hover:underline"
                          >
                            Review →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
