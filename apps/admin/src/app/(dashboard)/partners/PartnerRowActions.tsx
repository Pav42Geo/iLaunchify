'use client'

// Per-row 3-dot menu for /admin/partners.
//
// Spec (task #573): actions are Open detail / Suspend (if ACTIVE) /
// Reactivate (if SUSPENDED) / Reject (if PENDING). Every state-changing
// action is a deep-link to the partner detail page where the FSM
// transition happens — we never inline-mutate from the list page.

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
  PlayCircle,
  XOctagon,
} from 'lucide-react'
import type { PartnerStatus } from '@ilaunchify/db'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionSubMenu,
  RowActionLabel,
} from '@ilaunchify/ui'
import type { PartnerStatusBucket } from './partners-data'

interface Props {
  partnerId: string
  companyName: string
  email: string | null
  websiteUrl: string | null
  status: PartnerStatus
  bucket: PartnerStatusBucket
}

export function PartnerRowActions({
  partnerId,
  companyName,
  email,
  websiteUrl,
  status,
  bucket,
}: Props) {
  const router = useRouter()

  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  // Deep-link anchors on the detail page. The activation panel listens for
  // these hashes and pre-focuses the matching FSM button.
  const detailUrl = `/partners/${partnerId}`
  const suspendUrl = `${detailUrl}#activation-suspend`
  const reactivateUrl = `${detailUrl}#activation-reactivate`
  const rejectUrl = `${detailUrl}#activation-reject`
  const reviewUrl = `${detailUrl}/verification`

  return (
    <RowActionsMenu label={`Actions for ${companyName}`}>
      <RowActionLabel>{companyName}</RowActionLabel>

      <RowActionItem href={detailUrl} icon={Eye}>
        Open detail
      </RowActionItem>

      {bucket === 'PENDING' && (
        <RowActionItem href={reviewUrl} icon={ShieldCheck}>
          Review verification
        </RowActionItem>
      )}

      <RowActionSeparator />

      {/* Primary FSM transitions — all deep-link to the detail page */}
      {bucket === 'ACTIVE' && (
        <RowActionItem href={suspendUrl} icon={PauseCircle} danger>
          Suspend…
        </RowActionItem>
      )}
      {bucket === 'SUSPENDED' && (
        <RowActionItem href={reactivateUrl} icon={PlayCircle}>
          Reactivate…
        </RowActionItem>
      )}
      {bucket === 'PENDING' && (
        <RowActionItem href={rejectUrl} icon={XOctagon} danger>
          Reject…
        </RowActionItem>
      )}

      <RowActionSeparator />

      <RowActionItem
        onSelect={() => {
          if (email && typeof window !== 'undefined') {
            window.location.href = `mailto:${email}`
          }
        }}
        icon={Mail}
        disabled={!email}
      >
        Email partner
      </RowActionItem>
      {websiteUrl && (
        <RowActionItem href={websiteUrl} icon={Globe}>
          Visit website
        </RowActionItem>
      )}
      <RowActionItem
        onSelect={() => router.push(`/audit?entityType=Partner&entityId=${partnerId}`)}
        icon={History}
      >
        Audit history
      </RowActionItem>

      <RowActionSubMenu label="More" icon={Sparkles}>
        <RowActionItem onSelect={() => copy(partnerId, 'partner ID')} icon={Copy}>
          Copy partner ID
        </RowActionItem>
        {email && (
          <RowActionItem onSelect={() => copy(email, 'email')} icon={Copy}>
            Copy email
          </RowActionItem>
        )}
        <RowActionItem
          href={`/audit?entityType=Partner&entityId=${partnerId}`}
          icon={ExternalLink}
        >
          View in audit log
        </RowActionItem>
        <RowActionItem href={`/tiers#partner-${partnerId}`} icon={Sparkles}>
          Manage tier
        </RowActionItem>
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}

// Silence unused-warning on imported PartnerStatus type — kept for clarity at
// call sites where the raw status is threaded alongside the bucket.
void ({} as PartnerStatus)
