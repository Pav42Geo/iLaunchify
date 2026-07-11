'use client'

import { Pencil, History, Copy } from 'lucide-react'
import { RowActionsMenu, RowActionItem, RowActionSeparator, RowActionLabel } from '@ilaunchify/ui'

export function LegalRowActions({
  slug,
  title,
  documentId,
}: {
  slug: string
  title: string
  documentId: string
}) {
  return (
    <RowActionsMenu label={`Actions for ${title}`}>
      <RowActionLabel>{title}</RowActionLabel>
      <RowActionItem href={`/settings/legal/${slug}`} icon={Pencil}>
        Edit &amp; versions
      </RowActionItem>
      <RowActionSeparator />
      <RowActionItem href={`/audit?entityType=LegalDocument&entityId=${documentId}`} icon={History}>
        Audit history
      </RowActionItem>
      <RowActionItem
        onSelect={() => {
          navigator.clipboard?.writeText(slug)
        }}
        icon={Copy}
      >
        Copy slug
      </RowActionItem>
    </RowActionsMenu>
  )
}
