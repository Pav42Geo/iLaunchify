'use client'

// Per-row 3-dot menu for /support-tickets rows. Deep-links only — all
// mutations live on the detail page (locked admin pattern).

import { useRouter } from 'next/navigation'
import { Eye, History, Link2, User as UserIcon } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  ticketId: string
  requesterUserId: string
  entityType: string | null
  entityId: string | null
}

// Map a linkable entityType to its admin detail route (best-effort; unknown
// types fall back to the audit view).
function entityHref(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'Order':
      return `/orders/${entityId}`
    case 'Product':
      return `/products/${entityId}`
    case 'Partner':
      return `/partners/${entityId}`
    default:
      return `/audit?entityType=${entityType}&entityId=${entityId}`
  }
}

export function TicketRowActions({ ticketId, requesterUserId, entityType, entityId }: Props) {
  const router = useRouter()
  return (
    <RowActionsMenu label={`Actions for ticket ${ticketId.slice(-8)}`}>
      <RowActionLabel>Ticket #{ticketId.slice(-8)}</RowActionLabel>
      <RowActionItem href={`/support-tickets/${ticketId}`} icon={Eye}>
        Open ticket
      </RowActionItem>
      <RowActionItem
        onSelect={() => router.push(`/audit?entityType=Ticket&entityId=${ticketId}`)}
        icon={History}
      >
        Audit history
      </RowActionItem>
      <RowActionSeparator />
      <RowActionItem
        onSelect={() => router.push(`/creators?userId=${requesterUserId}`)}
        icon={UserIcon}
      >
        View requester
      </RowActionItem>
      {entityType && entityId && (
        <RowActionItem onSelect={() => router.push(entityHref(entityType, entityId))} icon={Link2}>
          View linked {entityType.toLowerCase()}
        </RowActionItem>
      )}
    </RowActionsMenu>
  )
}
