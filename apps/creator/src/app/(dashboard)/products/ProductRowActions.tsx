'use client'

// Per-card 3-dot menu for the creator /products list.
// Platform-standard RowActionsMenu primitive (@ilaunchify/ui).

import { Palette, Eye, ShoppingCart, Copy } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  id: string
  name: string
  hasDraft?: boolean
}

function copy(value: string, what: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
  } else {
    window.prompt(`Copy ${what}:`, value)
  }
}

export function ProductRowActions({ id, name, hasDraft }: Props) {
  return (
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
      <RowActionSeparator />
      <RowActionItem onSelect={() => copy(id, 'product ID')} icon={Copy}>
        Copy product ID
      </RowActionItem>
    </RowActionsMenu>
  )
}
