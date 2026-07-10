'use client'

// Per-row 3-dot menu for /admin/rooms — READ-ONLY oversight.
//
// Co-creation admin is observability only (spec §10): every item here is a
// deep-link (room detail, brief, creator CRM, partner CRM, audit log) or a
// clipboard copy. NO state-changing actions — rooms move through their FSM
// from the creator and partner apps, never from this list.

import {
  Eye,
  Lightbulb,
  User,
  Building2,
  History,
  Copy,
  ExternalLink,
  Sparkles,
} from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionSubMenu,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  roomId: string
  briefTitle: string
  briefId: string
  creatorId: string
  partnerId: string
}

export function RoomRowActions({
  roomId,
  briefTitle,
  briefId,
  creatorId,
  partnerId,
}: Props) {
  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  return (
    <RowActionsMenu label={`Actions for ${briefTitle}`}>
      <RowActionLabel>{briefTitle}</RowActionLabel>

      <RowActionItem href={`/rooms/${roomId}`} icon={Eye}>
        Open room
      </RowActionItem>
      <RowActionItem href={`/briefs/${briefId}`} icon={Lightbulb}>
        View brief
      </RowActionItem>
      <RowActionItem href={`/creators/${creatorId}`} icon={User}>
        View creator
      </RowActionItem>
      <RowActionItem href={`/partners/${partnerId}`} icon={Building2}>
        View partner
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem
        href={`/audit?entityType=CoCreationRoom&entityId=${roomId}`}
        icon={History}
      >
        Audit history
      </RowActionItem>

      <RowActionSubMenu label="More" icon={Sparkles}>
        <RowActionItem onSelect={() => copy(roomId, 'room ID')} icon={Copy}>
          Copy room ID
        </RowActionItem>
        <RowActionItem onSelect={() => copy(briefId, 'brief ID')} icon={Copy}>
          Copy brief ID
        </RowActionItem>
        <RowActionItem
          href={`/audit?entityType=CoCreationRoom&entityId=${roomId}`}
          icon={ExternalLink}
        >
          View in audit log
        </RowActionItem>
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}
