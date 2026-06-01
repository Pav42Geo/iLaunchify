'use client'

// Per-row 3-dot menu for /admin/products. Platform standard RowActionsMenu.
// See memory: ilaunchify-admin-surface-pattern.md (v2 — 2026-06-01).

import { useRouter } from 'next/navigation'
import {
  Eye,
  Building2,
  History,
  Copy,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionSubMenu,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  productId: string
  productName: string
  slug: string
  partnerId: string | null
}

export function ProductRowActions({
  productId,
  productName,
  slug,
  partnerId,
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
    <RowActionsMenu label={`Actions for ${productName}`}>
      <RowActionLabel>{productName}</RowActionLabel>
      <RowActionItem href={`/products/${productId}`} icon={Eye}>
        Review product
      </RowActionItem>
      {partnerId && (
        <RowActionItem href={`/partners/${partnerId}`} icon={Building2}>
          View partner
        </RowActionItem>
      )}

      <RowActionSeparator />

      <RowActionItem
        onSelect={() =>
          router.push(`/audit?entityType=ProductTemplate&entityId=${productId}`)
        }
        icon={History}
      >
        Audit history
      </RowActionItem>

      <RowActionSubMenu label="More" icon={Sparkles}>
        <RowActionItem onSelect={() => copy(productId, 'product ID')} icon={Copy}>
          Copy product ID
        </RowActionItem>
        <RowActionItem onSelect={() => copy(slug, 'slug')} icon={Copy}>
          Copy slug
        </RowActionItem>
        <RowActionItem
          href={`/audit?entityType=ProductTemplate&entityId=${productId}`}
          icon={ExternalLink}
        >
          View in audit log
        </RowActionItem>
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}
