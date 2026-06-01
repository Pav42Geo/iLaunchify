'use client'

// Per-row 3-dot menu for /admin/partners. Platform standard RowActionsMenu.

import { useRouter } from 'next/navigation'
import {
  Eye,
  ShieldCheck,
  Mail,
  Globe,
  ExternalLink,
  Copy,
  Sparkles,
  History,
  PauseCircle,
} from 'lucide-react'
import type { PartnerStatus } from '@prisma/client'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionSubMenu,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  partnerId: string
  companyName: string
  email: string
  websiteUrl: string | null
  status: PartnerStatus
}

export function PartnerRowActions({
  partnerId,
  companyName,
  email,
  websiteUrl,
  status,
}: Props) {
  const router = useRouter()

  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  const showReview = status === 'UNDER_REVIEW' || status === 'IN_PROGRESS'

  return (
    <RowActionsMenu label={`Actions for ${companyName}`}>
      <RowActionLabel>{companyName}</RowActionLabel>
      <RowActionItem href={`/partners/${partnerId}`} icon={Eye}>
        View partner
      </RowActionItem>
      {showReview && (
        <RowActionItem href={`/partners/${partnerId}/verification`} icon={ShieldCheck}>
          Review verification
        </RowActionItem>
      )}
      <RowActionItem
        onSelect={() => {
          if (typeof window !== 'undefined') window.location.href = `mailto:${email}`
        }}
        icon={Mail}
      >
        Email partner
      </RowActionItem>
      {websiteUrl && (
        <RowActionItem href={websiteUrl} icon={Globe}>
          Visit website
        </RowActionItem>
      )}

      <RowActionSeparator />

      <RowActionItem
        onSelect={() => router.push(`/audit?entityType=Partner&entityId=${partnerId}`)}
        icon={History}
      >
        Audit history
      </RowActionItem>
      <RowActionItem href={`/tiers#partner-${partnerId}`} icon={Sparkles}>
        Manage tier
      </RowActionItem>

      <RowActionSubMenu label="More" icon={Sparkles}>
        <RowActionItem onSelect={() => copy(partnerId, 'partner ID')} icon={Copy}>
          Copy partner ID
        </RowActionItem>
        <RowActionItem onSelect={() => copy(email, 'email')} icon={Copy}>
          Copy email
        </RowActionItem>
        <RowActionItem
          href={`/audit?entityType=Partner&entityId=${partnerId}`}
          icon={ExternalLink}
        >
          View in audit log
        </RowActionItem>
        {status === 'ACTIVE' && (
          <RowActionItem
            href={`/partners/${partnerId}#activation`}
            icon={PauseCircle}
            danger
          >
            Suspend partner…
          </RowActionItem>
        )}
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}
