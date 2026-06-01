'use client'

// Per-row 3-dot menu for /admin/leads. Platform standard RowActionsMenu.
//
// Quick actions for a Lead (Partner row in DRAFT / INVITED). Heavy
// qualify/disqualify flow stays on /leads/[leadId] — this is just for
// browsing-context shortcuts.

import { useRouter } from 'next/navigation'
import {
  Eye,
  Mail,
  Globe,
  ExternalLink,
  Copy,
  Sparkles,
  History,
  Building2,
} from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionSubMenu,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  leadId: string
  companyName: string
  email: string
  websiteUrl: string | null
}

export function LeadRowActions({ leadId, companyName, email, websiteUrl }: Props) {
  const router = useRouter()

  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  return (
    <RowActionsMenu label={`Actions for ${companyName}`}>
      <RowActionLabel>{companyName}</RowActionLabel>
      <RowActionItem href={`/leads/${leadId}`} icon={Eye}>
        View lead
      </RowActionItem>
      <RowActionItem
        onSelect={() => {
          if (typeof window !== 'undefined') window.location.href = `mailto:${email}`
        }}
        icon={Mail}
      >
        Email contact
      </RowActionItem>
      {websiteUrl && (
        <RowActionItem href={websiteUrl} icon={Globe}>
          Visit website
        </RowActionItem>
      )}

      <RowActionSeparator />

      <RowActionItem
        onSelect={() => router.push(`/audit?entityType=Partner&entityId=${leadId}`)}
        icon={History}
      >
        Audit history
      </RowActionItem>

      <RowActionSubMenu label="More" icon={Sparkles}>
        <RowActionItem onSelect={() => copy(leadId, 'lead ID')} icon={Copy}>
          Copy lead ID
        </RowActionItem>
        <RowActionItem onSelect={() => copy(email, 'email')} icon={Copy}>
          Copy email
        </RowActionItem>
        <RowActionItem href={`/partners/${leadId}`} icon={Building2}>
          Open as partner
        </RowActionItem>
        <RowActionItem
          href={`/audit?entityType=Partner&entityId=${leadId}`}
          icon={ExternalLink}
        >
          View in audit log
        </RowActionItem>
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}
