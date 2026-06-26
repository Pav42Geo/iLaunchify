// =============================================================================
// Product die-line readiness (DIELINE_MANAGEMENT_UX P2b — the "set view").
//
// A product carries a SET of die-lines (one per PackagingComponent). This page
// shows each product's components with their die-line status, and a completeness
// signal: a product is packaging-ready when every component that uses a die-line
// has one that's ACTIVE/ADMIN_VERIFIED. Read-only dashboard; the launch flow
// owns the hard go-live block.
// =============================================================================

import Link from 'next/link'
import { ArrowLeft, CheckCircle2, AlertTriangle, SquareDashedBottom } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Product die-line readiness — Admin' }

const READY = new Set(['ACTIVE', 'ADMIN_VERIFIED'])

function pretty(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase()
}

export default async function ProductReadinessPage() {
  const products = await prisma.product.findMany({
    where: { packagingComponents: { some: {} } },
    orderBy: { updatedAt: 'desc' },
    take: 120,
    select: {
      id: true,
      name: true,
      status: true,
      packagingComponents: {
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          role: true,
          packagingType: { select: { displayName: true } },
          dielineId: true,
          partnerOffering: { select: { dielineId: true } },
        },
      },
    },
  })

  // Resolve each component's die-line id, then fetch all statuses in one query.
  type Comp = (typeof products)[number]['packagingComponents'][number]
  const resolveId = (c: Comp) => c.dielineId ?? c.partnerOffering?.dielineId ?? null
  const allIds = [...new Set(products.flatMap((p) => p.packagingComponents.map(resolveId).filter(Boolean) as string[]))]
  const dls = allIds.length
    ? await prisma.packagingDieline.findMany({ where: { id: { in: allIds } }, select: { id: true, status: true } })
    : []
  const statusById = new Map(dls.map((d) => [d.id, d.status]))

  const rows = products.map((p) => {
    const comps = p.packagingComponents.map((c) => {
      const id = resolveId(c)
      const status = id ? (statusById.get(id) ?? null) : null
      return {
        id: c.id,
        dielineId: id,
        role: c.role as string,
        packagingTypeName: c.packagingType.displayName,
        status,
        ready: status != null && READY.has(status),
        missing: id == null,
      }
    })
    const needs = comps.length
    const ready = comps.filter((c) => c.ready).length
    return { id: p.id, name: p.name, status: p.status as string, comps, needs, ready, complete: needs > 0 && ready === needs }
  })

  const readyCount = rows.filter((r) => r.complete).length

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dielines" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-4 w-4" /> Die-line Operations
        </Link>
      </div>

      <AdminPageHeader
        eyebrow="Packaging · Product readiness"
        title="Product die-line readiness"
        description={
          <>
            Each product carries a set of component die-lines. A product is packaging-ready when every component&rsquo;s
            die-line is verified &amp; active.
          </>
        }
      />

      <div className="inline-flex items-center gap-2 rounded-full border border-success-200 bg-success-50 px-3 py-1 text-[12px] font-semibold text-success-700">
        {readyCount} of {rows.length} products ready
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-white px-4 py-16 text-center">
          <SquareDashedBottom className="mx-auto mb-2 h-8 w-8 text-ink-300" />
          <p className="text-[13px] font-semibold text-ink-700">No products with packaging components yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <section key={r.id} className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink-900">{r.name}</span>
                  <span className="rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                    {pretty(r.status)}
                  </span>
                </span>
                {r.complete ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2.5 py-0.5 text-[11px] font-semibold text-success-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Packaging ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-warning-50 px-2.5 py-0.5 text-[11px] font-semibold text-warning-800">
                    <AlertTriangle className="h-3.5 w-3.5" /> {r.ready}/{r.needs} die-lines verified
                  </span>
                )}
              </div>
              <ul className="divide-y divide-ink-100">
                {r.comps.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink-800">
                        {pretty(c.role)} <span className="font-normal text-ink-500">· {c.packagingTypeName}</span>
                      </p>
                      <p className="text-[11px] text-ink-500">
                        {c.missing ? 'no die-line attached' : `die-line ${c.status ? pretty(c.status) : 'unknown'}`}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                          c.ready
                            ? 'border-success-200 bg-success-50 text-success-700'
                            : c.missing
                              ? 'border-ink-200 bg-ink-50 text-ink-500'
                              : 'border-warning-200 bg-warning-50 text-warning-800'
                        }`}
                      >
                        {c.ready ? 'ready' : c.missing ? 'no die-line' : 'needs review'}
                      </span>
                      {c.dielineId && (
                        <Link
                          href={`/dielines/${c.dielineId}`}
                          className="rounded-full border border-ink-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink-700 hover:bg-ink-50"
                        >
                          Curate
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
