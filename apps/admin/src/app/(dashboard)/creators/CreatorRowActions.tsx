'use client'

// Per-row 3-dot menu for /admin/creators. Platform standard RowActionsMenu.
//
// Quick actions for a creator profile: View detail, Manage tier (deep-link
// to /tiers Creator tab anchor), Email, copy-utils, audit log.

import { useRouter } from 'next/navigation'
import {
  Eye,
  Mail,
  Crown,
  ExternalLink,
  Copy,
  Sparkles,
  History,
} from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionSubMenu,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  creatorId: string
  userId: string
  displayName: string
  email: string
  handle: string | null
}

export function CreatorRowActions({
  creatorId,
  userId,
  displayName,
  email,
  handle,
}: Props) {
  const router = useRouter()

  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  return (
    <RowActionsMenu label={`Actions for ${displayName}`}>
      <RowActionLabel>{displayName}</RowActionLabel>
      <RowActionItem href={`/creators/${creatorId}`} icon={Eye}>
        View profile
      </RowActionItem>
      <RowActionItem href={`/tiers#creator-${creatorId}`} icon={Crown}>
        Manage tier
      </RowActionItem>
      <RowActionItem
        onSelect={() => {
          if (typeof window !== 'undefined') window.location.href = `mailto:${email}`
        }}
        icon={Mail}
      >
        Email creator
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem
        onSelect={() => router.push(`/audit?actorId=${userId}`)}
        icon={History}
      >
        Activity log
      </RowActionItem>

      <RowActionSubMenu label="More" icon={Sparkles}>
        <RowActionItem onSelect={() => copy(creatorId, 'creator ID')} icon={Copy}>
          Copy creator ID
        </RowActionItem>
        <RowActionItem onSelect={() => copy(userId, 'user ID')} icon={Copy}>
          Copy user ID
        </RowActionItem>
        {handle && (
          <RowActionItem onSelect={() => copy(handle, 'handle')} icon={Copy}>
            Copy @{handle}
          </RowActionItem>
        )}
        <RowActionItem onSelect={() => copy(email, 'email')} icon={Copy}>
          Copy email
        </RowActionItem>
        <RowActionItem
          href={`/audit?entityType=CreatorProfile&entityId=${creatorId}`}
          icon={ExternalLink}
        >
          View in audit log
        </RowActionItem>
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}
