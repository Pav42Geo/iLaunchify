'use client'

// Slice C8 — per-row actions for the packaging-offerings table.
// Edit deep-links to the detail page; status transitions + delete go through
// the scoped server actions (setOfferingStatus / deletePackagingOffering).

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Send, CheckCircle2, Archive, RotateCcw, Trash2 } from 'lucide-react'
import { RowActionsMenu, RowActionItem } from '@ilaunchify/ui'
import type { OfferingStatus } from '@ilaunchify/db'
import { setOfferingStatus, deletePackagingOffering } from './offering-actions'

export function OfferingRowActions({
  id,
  label,
  status,
}: {
  id: string
  label: string
  status: OfferingStatus
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function change(to: OfferingStatus) {
    startTransition(async () => {
      const res = await setOfferingStatus(id, to)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Offering ${to.replace('_', ' ').toLowerCase()}`)
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm(`Delete the ${label} offering? This cannot be undone.`)) return
    startTransition(async () => {
      const res = await deletePackagingOffering(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Offering deleted')
      router.refresh()
    })
  }

  return (
    <RowActionsMenu label={`Actions for ${label}`}>
      <RowActionItem href={`/packaging/offerings/${id}`} icon={Pencil}>
        Edit
      </RowActionItem>

      {status === 'DRAFT' && (
        <RowActionItem icon={Send} onSelect={() => change('PENDING_REVIEW')} disabled={pending}>
          Submit for review
        </RowActionItem>
      )}
      {status !== 'ACTIVE' && status !== 'ARCHIVED' && (
        <RowActionItem icon={CheckCircle2} onSelect={() => change('ACTIVE')} disabled={pending}>
          Activate
        </RowActionItem>
      )}
      {status === 'ARCHIVED' ? (
        <RowActionItem icon={RotateCcw} onSelect={() => change('DRAFT')} disabled={pending}>
          Restore to draft
        </RowActionItem>
      ) : (
        <RowActionItem icon={Archive} onSelect={() => change('ARCHIVED')} disabled={pending}>
          Archive
        </RowActionItem>
      )}

      <RowActionItem icon={Trash2} danger onSelect={remove} disabled={pending}>
        Delete
      </RowActionItem>
    </RowActionsMenu>
  )
}
