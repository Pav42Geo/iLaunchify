'use client'

// Per-row 3-dot menu for /logistics/shipments.
//
// Shipments are OrderDispatch rows, so every action deep-links to the existing
// order / partner detail pages — we never inline-mutate from the list page
// (locked admin surface pattern).

import { Eye, Building2, History, Copy } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  dispatchId: string
  orderId: string
  orderRef: string
  partnerId: string
  trackingNumber: string | null
}

export function ShipmentRowActions({ dispatchId, orderId, orderRef, partnerId, trackingNumber }: Props) {
  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  return (
    <RowActionsMenu label={`Actions for ${orderRef}`}>
      <RowActionLabel>{orderRef}</RowActionLabel>

      <RowActionItem href={`/orders/${orderId}`} icon={Eye}>
        Open order detail
      </RowActionItem>
      <RowActionItem href={`/partners/${partnerId}`} icon={Building2}>
        Open shipping partner
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem
        href={`/audit?entityType=OrderDispatch&entityId=${dispatchId}`}
        icon={History}
      >
        Dispatch audit history
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem onSelect={() => copy(dispatchId, 'dispatch ID')} icon={Copy}>
        Copy dispatch ID
      </RowActionItem>
      {trackingNumber && (
        <RowActionItem onSelect={() => copy(trackingNumber, 'tracking number')} icon={Copy}>
          Copy tracking number
        </RowActionItem>
      )}
    </RowActionsMenu>
  )
}
