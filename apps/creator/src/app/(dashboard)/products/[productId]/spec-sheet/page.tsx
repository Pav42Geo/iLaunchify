// =============================================================================
// Product Spec Sheet viewer (read-only) — renders the latest issued snapshot
// for this product. docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md §6.
// =============================================================================

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { NutritionFactsRenderer } from '@ilaunchify/ui'
import type { SpecSheetSnapshot } from '../configure/spec-sheet-types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Spec sheet' }

const money = (c: number) => `$${(c / 100).toFixed(2)}`

interface PageProps {
  params: Promise<{ productId: string }>
}

export default async function SpecSheetPage({ params }: PageProps) {
  const { productId } = await params
  const user = await requireUser()

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true, name: true, productTemplateId: true },
  })
  if (!product?.productTemplateId) notFound()

  // Loose read — model may be ungenerated until the migration runs.
  const loose = prisma as unknown as {
    productSpecSheet?: {
      findMany: (a: unknown) => Promise<
        Array<{ version: number; status: string; createdAt: Date; snapshot: unknown }>
      >
    }
  }
  const rows =
    (await loose.productSpecSheet
      ?.findMany({
        where: { productTemplateId: product.productTemplateId },
        orderBy: { version: 'desc' },
        take: 50,
      })
      .catch(() => [])) ?? []

  // Latest snapshot configured for THIS product.
  const match = rows.find((r) => {
    const s = r.snapshot as Partial<SpecSheetSnapshot> | null
    return s?.productId === productId
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href={`/products/${productId}/configure`}
        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pink-700 hover:text-pink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to configurator
      </Link>

      {!match ? (
        <div className="mt-6 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-ink-300" />
          <h1 className="mt-3 font-display text-[16px] font-semibold text-ink-900">
            No spec sheet yet
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">
            Configure this product and issue a spec sheet to freeze the configuration.
          </p>
          <Link
            href={`/products/${productId}/configure`}
            className="mt-4 inline-flex items-center rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-ink-800"
          >
            Configure now
          </Link>
        </div>
      ) : (
        <SpecSheetView version={match.version} createdAt={match.createdAt} snapshot={match.snapshot as SpecSheetSnapshot} />
      )}
    </div>
  )
}

function SpecSheetView({
  version,
  createdAt,
  snapshot,
}: {
  version: number
  createdAt: Date
  snapshot: SpecSheetSnapshot
}) {
  const q = snapshot.quote
  return (
    <div className="mt-4 space-y-5">
      <header className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-5 py-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Product spec sheet · v{version}
        </p>
        <h1 className="mt-1 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-900">
          {snapshot.productName}
        </h1>
        <p className="mt-1 text-[12px] text-ink-600">
          Issued {new Date(createdAt).toLocaleString()} · from {snapshot.templateName}
        </p>
      </header>

      <Card title="Configuration">
        <dl className="divide-y divide-ink-100 text-[13px]">
          {snapshot.flavor && <Line label="Flavor" value={snapshot.flavor.name} />}
          {snapshot.options.map((o) => (
            <Line
              key={o.valueId}
              label={o.axisLabel}
              value={
                <span className="inline-flex items-center gap-1.5">
                  {o.valueLabel}
                  {o.affectsLabel && (
                    <span className="rounded-full border border-warning-200 bg-warning-50 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-warning-800">
                      label
                    </span>
                  )}
                </span>
              }
            />
          ))}
          <Line label="Quantity" value={`${snapshot.quantity.toLocaleString()} units`} />
          <Line label="Run type" value={snapshot.firstRun ? 'First production run' : 'Repeat order'} />
        </dl>
      </Card>

      <Card title="Quote (locked)">
        <dl className="divide-y divide-ink-100 text-[13px]">
          <Line label="Per unit" value={money(q.unitCostCents)} />
          <Line label="Lead time" value={`${q.leadTimeDays} days`} />
          <Line label="MOQ" value={q.moq.toLocaleString()} />
          {q.oneTimeFeesCents > 0 && <Line label="One-time fees" value={money(q.oneTimeFeesCents)} />}
          {q.perUnitFeesCents > 0 && <Line label="Per-unit fees" value={money(q.perUnitFeesCents)} />}
          {q.perOrderFeesCents > 0 && <Line label="Per-order fees" value={money(q.perOrderFeesCents)} />}
          <Line label="Production subtotal" value={money(q.subtotalCents)} />
          {q.platformFeeCents != null && (
            <Line
              label={`Platform fee${q.platformFeePercent != null ? ` (${q.platformFeePercent}%)` : ''}`}
              value={money(q.platformFeeCents)}
            />
          )}
          <Line
            label="Total"
            value={<strong>{money(q.allInTotalCents ?? q.subtotalCents)}</strong>}
          />
        </dl>
      </Card>

      {snapshot.recipe.length > 0 && (
        <Card title="Recipe">
          <p className="text-[12.5px] text-ink-700">{snapshot.recipe.join(', ')}</p>
        </Card>
      )}

      {snapshot.label ? (
        <Card title="Nutrition Facts (as configured)">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <NutritionFactsRenderer data={snapshot.label as any} widthPx={300} />
        </Card>
      ) : null}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="border-b border-ink-100 bg-ink-50/60 px-5 py-3">
        <h2 className="font-display text-[14px] font-semibold text-ink-900">{title}</h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px,1fr] gap-3 py-2 first:pt-0 last:pb-0">
      <span className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
        {label}
      </span>
      <span className="text-[12.5px] text-ink-900">{value}</span>
    </div>
  )
}
