'use client'

// Per-row 3-dot menu for the partner /orders table.
// Platform-standard RowActionsMenu primitive (@ilaunchify/ui).

import { Eye, Copy, LifeBuoy } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  dispatchId: string
  orderId: string
  /** Human order number (ILF-YYMMDD-XXXXX) when available; falls back to the short id. */
  orderNumber?: string | null
}

function copy(value: string, what: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
  } else {
    window.prompt(`Copy ${what}:`, value)
  }
}

export function OrderRowActions({ dispatchId, orderId, orderNumber }: Props) {
  return (
    <RowActionsMenu label={`Actions for dispatch ${dispatchId.slice(-8)}`}>
      <RowActionLabel>Order {orderNumber ?? `#${orderId.slice(-8)}`}</RowActionLabel>
      <RowActionItem href={`/orders/${dispatchId}`} icon={Eye}>
        Open dispatch
      </RowActionItem>
      <RowActionSeparator />
      <RowActionItem href={`/help/new?category=order-issue&dispatchId=${dispatchId}`} icon={LifeBuoy}>
        Get order support
      </RowActionItem>
      <RowActionItem onSelect={() => copy(orderId, 'order ID')} icon={Copy}>
        Copy order ID
      </RowActionItem>
    </RowActionsMenu>
  )
}
