'use client'

// Track C / C7.g — Studio Components drawer.
//
// Read-only view of the product's packaging components (primary / closure /
// seal / …) so the creator can see the multi-component structure while
// designing. Editing each component's own artwork on a separate surface rides
// the multi-surface release (V1.5) — the codebase already defers per-surface
// canvas switching (see SurfacesSection + docs/MULTI_SURFACE_PLAN.md). Slot
// setup happens in checkout's Production step (C7.f).

import * as React from 'react'
import { Loader2, Lock, Boxes, Info } from 'lucide-react'
import {
  listComponentsForDesign,
  type DesignComponentRow,
} from '../component-view-actions'

const ROLE_LABEL: Record<string, string> = {
  CONTAINER: 'Primary',
  CLOSURE: 'Closure',
  SEAL: 'Seal',
  CARTON: 'Carton',
  INSERT: 'Insert',
  LABEL: 'Label',
  SHIPPER: 'Shipper',
}

const TIER_LABEL: Record<string, string> = {
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
  TERTIARY: 'Tertiary',
}

export function ComponentsDrawer({ productId }: { productId: string }) {
  const [rows, setRows] = React.useState<DesignComponentRow[] | null>(null)

  React.useEffect(() => {
    let alive = true
    listComponentsForDesign(productId).then((r) => {
      if (alive) setRows(r)
    })
    return () => {
      alive = false
    }
  }, [productId])

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-[1.45] text-ink-500">
        The physical parts that make up this product. The label you&apos;re designing applies to the{' '}
        <span className="font-medium text-ink-700">primary container</span>.
      </p>

      {rows === null ? (
        <div className="flex items-center gap-2 text-[12px] text-ink-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading components…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-ink-300 bg-ink-50/40 px-4 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
            <Boxes className="h-4 w-4 text-ink-400" />
          </span>
          <p className="text-[12px] text-ink-500">
            No packaging components set up yet. Choose your container at checkout (Review Production)
            and the closure &amp; seal slots are added automatically.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                    {ROLE_LABEL[row.role] ?? row.role}
                  </span>
                  {row.fdaLocked && (
                    <span
                      title="FDA-required tamper-evident seal (21 CFR 211.132)"
                      className="inline-flex items-center gap-0.5 text-[10px] text-amber-700"
                    >
                      <Lock className="h-3 w-3" /> required
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[13px] font-medium text-ink-900">
                  {row.packagingTypeName}
                </div>
              </div>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-400">
                {TIER_LABEL[row.tier] ?? row.tier}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-ink-50 px-3 py-2.5 text-[11.5px] leading-[1.45] text-ink-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
        <span>
          Designing a separate surface per component (a printed cap, a branded shrink sleeve) arrives
          with multi-surface editing. For now, artwork applies to the primary container.
        </span>
      </div>
    </div>
  )
}
