'use client'

// Per-row 3-dot menu for /admin/briefs — READ-ONLY oversight.
//
// Co-creation admin is observability only (spec §10): every item here is a
// deep-link (brief detail, creator CRM, room, audit log) or a clipboard copy.
// NO state-changing actions — briefs move through their FSM from the creator
// and partner apps, never from this list.

import {
  Eye,
  User,
  DoorOpen,
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
  briefId: string
  title: string
  creatorId: string
  roomId: string | null
}

export function BriefRowActions({ briefId, title, creatorId, roomId }: Props) {
  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  return (
    <RowActionsMenu label={`Actions for ${title}`}>
      <RowActionLabel>{title}</RowActionLabel>

      <RowActionItem href={`/briefs/${briefId}`} icon={Eye}>
        Open brief
      </RowActionItem>
      <RowActionItem href={`/creators/${creatorId}`} icon={User}>
        View creator
      </RowActionItem>
      {roomId && (
        <RowActionItem href={`/rooms/${roomId}`} icon={DoorOpen}>
          View room
        </RowActionItem>
      )}

      <RowActionSeparator />

      <RowActionItem
        href={`/audit?entityType=ProductBrief&entityId=${briefId}`}
        icon={History}
      >
        Audit history
      </RowActionItem>

      <RowActionSubMenu label="More" icon={Sparkles}>
        <RowActionItem onSelect={() => copy(briefId, 'brief ID')} icon={Copy}>
          Copy brief ID
        </RowActionItem>
        <RowActionItem
          href={`/audit?entityType=ProductBrief&entityId=${briefId}`}
          icon={ExternalLink}
        >
          View in audit log
        </RowActionItem>
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}
