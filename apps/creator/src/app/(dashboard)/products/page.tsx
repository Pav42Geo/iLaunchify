// REBUILD R6 — Creator products list, ported to the partner-app's
// sectioned-table layout (apps/partner/src/app/(dashboard)/products).
//
// Why: the old card-per-product list didn't scale past a handful of
// rows and gave creators no signal about which products needed
// attention. Grouping by ProductStatus surfaces the most actionable
// rows (DRAFT → IN_REVIEW → COMPLIANT → PUBLISHED) at the top.
//
// Columns map to what a creator cares about, NOT a partner:
//   Name (+ brand subtitle) · Template · Variant · Recipe state · Updated · Actions
// "New product" deep-links into the public marketplace because the
// only legitimate creation path is template-pick → customize.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ilaunchify/ui'
import { Plus, Package } from 'lucide-react'
import { marketingUrl } from '@/lib/marketing-url'

// String unions mirror the Prisma enums so we don't need to import
// types directly from @prisma/client (which isn't on this app's
// tsconfig path). Kept in sync manually — Prisma schema is the
// source of truth.
type ProductStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'COMPLIANT'
  | 'PUBLISHED'
  | 'PAUSED'
  | 'ARCHIVED'
type ComplianceOutcome = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAILED'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Products — iLaunchify' }

// Status badge — pink/emerald/blue/zinc palette, matched to the creator
// app's identity (pink hero) but consistent with partner badge shapes.
const STATUS_BADGE: Record<ProductStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  IN_REVIEW: { label: 'In review', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  COMPLIANT: { label: 'Ready to order', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  PUBLISHED: { label: 'Live', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  ARCHIVED: { label: 'Archived', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
}

const RECIPE_BADGE: Record<ComplianceOutcome | 'NONE', { label: string; cls: string }> = {
  NONE: { label: 'No recipe', cls: 'text-zinc-400' },
  PASS: { label: 'Compliant', cls: 'text-emerald-700' },
  PASS_WITH_WARNINGS: { label: 'With warnings', cls: 'text-amber-700' },
  FAILED: { label: 'Compliance failed', cls: 'text-pink-700' },
}

export default async function ProductsListPage() {
  const user = await requireUser()
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    include: {
      brands: {
        include: {
          products: {
            orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
            include: {
              productTemplate: { select: { name: true, slug: true } },
              variant: { select: { flavor: true, containerFormat: true } },
              recipe: {
                select: {
                  status: true,
                  complianceChecks: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { outcome: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  // Flatten brand → products with brand label preserved. Cast to the
  // Row type declared below — Prisma's nested-select inferred shape
  // matches but TS can't unify the brand/recipe scalars without help.
  const products: Row[] = (profile?.brands.flatMap((b) =>
    b.products.map((p) => ({ ...p, brandName: b.name })),
  ) ?? []) as unknown as Row[]

  const grouped = groupByStatus(products)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            My products
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Every product you&apos;ve started, grouped by status. Drafts and
            in-review rows surface first so you can finish what you began.
          </p>
        </div>
        <Button asChild>
          {/* Creators can't create blank products — they always start
              from a marketplace template. Send them there. */}
          <a href={marketingUrl('/marketplace')}>
            <Plus className="mr-1.5 h-4 w-4" /> New product
          </a>
        </Button>
      </header>

      {products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-pink-50 p-3">
              <Package className="h-7 w-7 text-pink-600" />
            </div>
            <CardTitle className="text-base">No products yet</CardTitle>
            <CardDescription className="max-w-md text-sm">
              Pick a template from the marketplace, customise it for your
              brand, and we&apos;ll handle manufacturing, printing, and
              fulfilment. Saved as a draft until you place an order.
            </CardDescription>
            <Button asChild className="mt-2">
              <a href={marketingUrl('/marketplace')}>
                <Plus className="mr-1.5 h-4 w-4" /> Browse the marketplace
              </a>
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
// Grouping
// -----------------------------------------------------------------------------

type Row = {
  id: string
  name: string
  status: ProductStatus
  updatedAt: Date
  brandName: string
  productTemplate: { name: string; slug: string } | null
  variant: { flavor: string | null; containerFormat: string | null } | null
  recipe: {
    status: string
    complianceChecks: { outcome: ComplianceOutcome }[]
  } | null
}

function groupByStatus(rows: Row[]): Array<{ status: ProductStatus; rows: Row[] }> {
  const order: ProductStatus[] = [
    'DRAFT',
    'IN_REVIEW',
    'COMPLIANT',
    'PUBLISHED',
    'PAUSED',
    'ARCHIVED',
  ]
  const buckets = new Map<ProductStatus, Row[]>()
  for (const r of rows) {
    const arr = buckets.get(r.status) ?? []
    arr.push(r)
    buckets.set(r.status, arr)
  }
  return order
    .filter((s) => (buckets.get(s)?.length ?? 0) > 0)
    .map((status) => ({ status, rows: buckets.get(status)! }))
}

// -----------------------------------------------------------------------------
// Sectioned table
// -----------------------------------------------------------------------------

function ProductSection({ status, rows }: { status: ProductStatus; rows: Row[] }) {
  const badge =
    STATUS_BADGE[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${badge.cls}`}
          >
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
                <th className="px-6 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Variant</th>
                <th className="px-3 py-2 font-medium">Recipe</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-6 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const recipeOutcome =
                  r.recipe?.complianceChecks[0]?.outcome ?? null
                const recipeBadge =
                  RECIPE_BADGE[recipeOutcome ?? 'NONE'] ??
                  RECIPE_BADGE.NONE
                return (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-100 hover:bg-zinc-50"
                  >
                    <td className="px-6 py-3">
                      <div className="font-medium text-zinc-900">{r.name}</div>
                      <div className="text-[12px] text-zinc-500">
                        {r.brandName}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-zinc-700">
                      {r.productTemplate?.name ?? (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-700">
                      {r.variant?.flavor ?? (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className={`px-3 py-3 text-[12px] ${recipeBadge.cls}`}>
                      {recipeBadge.label}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/products/${r.id}`}
                        className="text-sm font-medium text-pink-700 hover:underline"
                      >
                        Open →
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
  )
}
