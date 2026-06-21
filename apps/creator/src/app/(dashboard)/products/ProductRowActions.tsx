'use client'

// Per-card 3-dot menu for the creator /products list.
// Platform-standard RowActionsMenu primitive (@ilaunchify/ui).

import { Palette, Eye, ShoppingCart, Copy, Download, LifeBuoy } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'
import { useLabelDownload } from '@/components/labels/useLabelDownload'

interface Props {
  id: string
  name: string
  hasDraft?: boolean
  /** Builder+ — show the "Download labels" action (hidden for Maker). */
  canDownloadLabels?: boolean
}

function copy(value: string, what: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
  } else {
    window.prompt(`Copy ${what}:`, value)
  }
}

export function ProductRowActions({ id, name, hasDraft, canDownloadLabels }: Props) {
  // Shared label-download flow (recomputes every flavor's label → print/PDF).
  // The hidden render holder must live OUTSIDE the menu so it stays mounted
  // after the dropdown closes on select.
  const { trigger, busy, holder } = useLabelDownload(id, name)

  return (
    <>
      <RowActionsMenu label={`Actions for ${name}`}>
        <RowActionLabel>{name}</RowActionLabel>
        <RowActionItem href={`/products/${id}/design/canvas`} icon={Palette}>
          Open in Studio
        </RowActionItem>
        <RowActionItem href={`/products/${id}`} icon={Eye}>
          Product details
        </RowActionItem>
        {hasDraft && (
          <RowActionItem href={`/products/${id}/checkout`} icon={ShoppingCart}>
            Resume checkout
          </RowActionItem>
        )}
        {canDownloadLabels && (
          <>
            <RowActionSeparator />
            <RowActionItem onSelect={() => { void trigger() }} icon={Download} disabled={busy}>
              {busy ? 'Preparing labels…' : 'Download labels'}
            </RowActionItem>
          </>
        )}
        <RowActionSeparator />
        <RowActionItem href={`/help/new?productId=${id}`} icon={LifeBuoy}>
          Get product support
        </RowActionItem>
        <RowActionItem onSelect={() => copy(id, 'product ID')} icon={Copy}>
          Copy product ID
        </RowActionItem>
      </RowActionsMenu>
      {holder}
    </>
  )
}
