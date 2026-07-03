// Work-order skin for COPACKING dispatches — Partner Role Accounts P2
// (docs/PARTNER_ROLE_ACCOUNTS.md §3.2.A). Component-readiness panel: the
// upstream legs of the SAME order's workflow graph (labels from the print
// leg, product from the manufacturing leg) with live statuses — the
// co-packer sees WHEN their inputs arrive without seeing WHO to chase
// (orchestration stays hidden; iLaunchify coordinates the handoffs).
//
// The fill/assembly spec itself is the manifest (snapshotted at acceptance —
// legal reproducibility); this card frames the work around it.

import { Boxes, CircleCheck, Clock, Truck } from 'lucide-react'

export interface ComponentLegView {
  id: string
  type: string
  status: string
  shippedAt: string | null
  deliveredAt: string | null
}

const LEG_LABEL: Record<string, string> = {
  PRODUCT: 'Product / bulk goods',
  LABEL: 'Printed labels & packaging',
  ACCESSORY: 'Accessories',
}

// Traffic-light per upstream status: has it left, has it landed.
function legState(l: ComponentLegView): { label: string; tone: 'done' | 'moving' | 'waiting' } {
  if (l.deliveredAt || l.status === 'DELIVERED') return { label: 'Arrived', tone: 'done' }
  if (l.shippedAt || l.status === 'SHIPPED' || l.status === 'IN_TRANSIT')
    return { label: 'In transit to you', tone: 'moving' }
  if (['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK', 'READY'].includes(l.status))
    return { label: 'In production upstream', tone: 'waiting' }
  if (l.status === 'PENDING_ACCEPT' || l.status === 'CHANGES_REQUESTED')
    return { label: 'Not yet started', tone: 'waiting' }
  return { label: l.status.toLowerCase().replace(/_/g, ' '), tone: 'waiting' }
}

export function WorkOrderCard({ components }: { components: ComponentLegView[] }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
        <Boxes className="h-4 w-4 text-ink-500" aria-hidden="true" /> Component readiness
      </h2>
      <p className="mt-1 text-[12px] text-ink-600">
        Inputs iLaunchify routes to your dock for this work order. Schedule your line once
        everything reads <span className="font-medium text-success-700">Arrived</span> — the fill
        &amp; assembly spec is pinned in the manifest below (frozen at your acceptance).
      </p>

      {components.length === 0 ? (
        <p className="mt-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2 text-[12.5px] text-ink-600">
          All inputs for this work order are creator-supplied or already at your facility.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-ink-50 rounded-xl border border-ink-100">
          {components.map((c) => {
            const s = legState(c)
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                {s.tone === 'done' ? (
                  <CircleCheck className="h-4 w-4 shrink-0 text-success-500" aria-hidden="true" />
                ) : s.tone === 'moving' ? (
                  <Truck className="h-4 w-4 shrink-0 text-info-500" aria-hidden="true" />
                ) : (
                  <Clock className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                )}
                <span className="font-medium text-ink-900">{LEG_LABEL[c.type] ?? c.type}</span>
                <span
                  className={
                    s.tone === 'done'
                      ? 'ml-auto text-[12px] font-medium text-success-700'
                      : s.tone === 'moving'
                        ? 'ml-auto text-[12px] font-medium text-info-700'
                        : 'ml-auto text-[12px] text-ink-500'
                  }
                >
                  {s.label}
                  {c.deliveredAt && ` · ${new Date(c.deliveredAt).toLocaleDateString()}`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
