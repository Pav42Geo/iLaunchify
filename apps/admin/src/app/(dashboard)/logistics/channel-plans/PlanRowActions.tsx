'use client'

// Per-row 3-dot menu for /logistics/channel-plans.
//
// Every action deep-links (plan detail, admin order detail, admin creator
// detail) — we never inline-mutate from the list page (locked admin surface
// pattern). Cancel lives on the detail page.

import {
  Copy,
  Eye,
  History,
  ShoppingBag,
  User,
} from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  planId: string
  orderId: string
  creatorId: string
  orderRef: string
  externalPlanId: string
}

export function PlanRowActions({ planId, orderId, creatorId, orderRef, externalPlanId }: Props) {
  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  return (
    <RowActionsMenu label={`Actions for plan ${orderRef}`}>
      <RowActionLabel>{orderRef}</RowActionLabel>

      <RowActionItem href={`/logistics/channel-plans/${planId}`} icon={Eye}>
        Open plan detail
      </RowActionItem>
      <RowActionItem href={`/orders/${orderId}`} icon={ShoppingBag}>
        Open order detail
      </RowActionItem>
      <RowActionItem href={`/creators/${creatorId}`} icon={User}>
        Open creator detail
      </RowActionItem>

      <RowActionSeparator />

      {/* Plan mutations log under the parent Order (ChannelInboundPlan isn't in
          packages/audit AUDIT_ENTITY_TYPES — see [planId]/actions.ts). */}
      <RowActionItem href={`/audit?entityType=Order&entityId=${orderId}`} icon={History}>
        Audit history
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem onSelect={() => copy(planId, 'plan ID')} icon={Copy}>
        Copy plan ID
      </RowActionItem>
      <RowActionItem onSelect={() => copy(externalPlanId, 'external plan ID')} icon={Copy}>
        Copy external plan ID
      </RowActionItem>
    </RowActionsMenu>
  )
}
