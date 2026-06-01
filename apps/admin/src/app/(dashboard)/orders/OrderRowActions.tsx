'use client'

// Per-row 3-dot menu for /admin/orders rows. Uses the platform standard
// RowActionsMenu primitive from @ilaunchify/ui.

import { useRouter } from 'next/navigation'
import {
  Eye,
  ExternalLink,
  Copy,
  Sparkles,
  User as UserIcon,
  Building2,
  CreditCard,
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
  orderId: string
  brandName: string | null
  brandHandle: string | null
  creatorUserId: string
  stripeChargeId?: string | null
}

export function OrderRowActions({
  orderId,
  brandName,
  brandHandle,
  creatorUserId,
  stripeChargeId,
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
    <RowActionsMenu label={`Actions for order ${orderId.slice(-8)}`}>
      <RowActionLabel>Order #{orderId.slice(-8)}</RowActionLabel>
      <RowActionItem href={`/orders/${orderId}`} icon={Eye}>
        View order
      </RowActionItem>
      <RowActionItem
        onSelect={() => router.push(`/audit?entityType=Order&entityId=${orderId}`)}
        icon={History}
      >
        Audit history
      </RowActionItem>

      <RowActionSeparator />

      <RowActionSubMenu label="People" icon={UserIcon}>
        <RowActionItem
          onSelect={() => router.push(`/audit?actorId=${creatorUserId}`)}
          icon={UserIcon}
        >
          Creator activity
        </RowActionItem>
        {brandName && (
          <RowActionItem disabled icon={Building2}>
            Brand · {brandName}
          </RowActionItem>
        )}
      </RowActionSubMenu>

      {stripeChargeId && (
        <RowActionItem
          href={`https://dashboard.stripe.com/payments/${stripeChargeId}`}
          icon={CreditCard}
        >
          Open in Stripe
        </RowActionItem>
      )}

      <RowActionSeparator />

      <RowActionSubMenu label="More" icon={Sparkles}>
        <RowActionItem onSelect={() => copy(orderId, 'order ID')} icon={Copy}>
          Copy order ID
        </RowActionItem>
        {brandHandle && (
          <RowActionItem onSelect={() => copy(brandHandle, 'brand handle')} icon={Copy}>
            Copy brand handle
          </RowActionItem>
        )}
        <RowActionItem
          href={`/audit?entityType=Order&entityId=${orderId}`}
          icon={ExternalLink}
        >
          View in audit log
        </RowActionItem>
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}
