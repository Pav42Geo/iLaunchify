'use client'

// Per-row 3-dot menu for /logistics/fulfillment-centers.
//
// FC nodes are WAREHOUSE PartnerServices, so every action deep-links to the
// existing partner detail page (/partners/[partnerId]) — we never inline-mutate
// from the list page (locked admin surface pattern).

import {
  Eye,
  ShieldCheck,
  History,
  Copy,
  ExternalLink,
} from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  serviceId: string
  partnerId: string
  companyName: string
}

export function FcRowActions({ serviceId, partnerId, companyName }: Props) {
  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  const detailUrl = `/partners/${partnerId}`

  return (
    <RowActionsMenu label={`Actions for ${companyName}`}>
      <RowActionLabel>{companyName}</RowActionLabel>

      <RowActionItem href={detailUrl} icon={Eye}>
        Open partner detail
      </RowActionItem>
      <RowActionItem href={`${detailUrl}/verification`} icon={ShieldCheck}>
        Review verification
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem
        href={`/audit?entityType=PartnerService&entityId=${serviceId}`}
        icon={History}
      >
        Audit history
      </RowActionItem>
      <RowActionItem
        href={`/audit?entityType=Partner&entityId=${partnerId}`}
        icon={ExternalLink}
      >
        Partner audit log
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem onSelect={() => copy(serviceId, 'service ID')} icon={Copy}>
        Copy service ID
      </RowActionItem>
      <RowActionItem onSelect={() => copy(partnerId, 'partner ID')} icon={Copy}>
        Copy partner ID
      </RowActionItem>
    </RowActionsMenu>
  )
}
