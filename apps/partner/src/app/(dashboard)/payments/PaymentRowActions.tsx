'use client'

// Per-row 3-dot menu for the partner /payments payouts table.
// Platform-standard RowActionsMenu primitive (@ilaunchify/ui).

import { Copy, Hash } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  transferId: string
  orderId: string
}

function copy(value: string, what: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
  } else {
    window.prompt(`Copy ${what}:`, value)
  }
}

export function PaymentRowActions({ transferId, orderId }: Props) {
  return (
    <RowActionsMenu label={`Actions for payout ${transferId.slice(-8)}`}>
      <RowActionLabel>Payout #{transferId.slice(-8)}</RowActionLabel>
      <RowActionItem onSelect={() => copy(orderId, 'order ID')} icon={Hash}>
        Copy order ID
      </RowActionItem>
      <RowActionItem onSelect={() => copy(transferId, 'transfer ID')} icon={Copy}>
        Copy transfer ID
      </RowActionItem>
    </RowActionsMenu>
  )
}
