'use client'

// C7.k — per-row 3-dot menu for the admin accessory verification queue.
//
// Unlike most admin list pages (which deep-link to a detail page), accessories
// have no admin detail page yet — the verification verbs ARE the workflow, so
// these call the server actions directly with useTransition + toast + refresh.
// State changes are simple status flips with a confirmation toast, mirroring
// the partner-side AccessoryRowActions.

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Archive, RotateCcw, History, Building2 } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'
import { approveAccessory, archiveAccessory, reactivateAccessory } from './actions'

interface Props {
  id: string
  name: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'ARCHIVED'
  partnerId: string | null
}

export function AccessoryRowActions({ id, name, status, partnerId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function run(
    fn: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>,
    successMsg: string,
  ) {
    startTransition(async () => {
      const res = await fn(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(successMsg)
      router.refresh()
    })
  }

  return (
    <RowActionsMenu label={`Actions for ${name}`}>
      <RowActionLabel>{name}</RowActionLabel>

      {status === 'PENDING_REVIEW' && (
        <RowActionItem
          icon={CheckCircle2}
          disabled={pending}
          onSelect={() => run(approveAccessory, 'Accessory approved')}
        >
          Approve
        </RowActionItem>
      )}
      {status === 'ACTIVE' && (
        <RowActionItem
          icon={Archive}
          danger
          disabled={pending}
          onSelect={() => run(archiveAccessory, 'Accessory archived')}
        >
          Archive
        </RowActionItem>
      )}
      {status === 'ARCHIVED' && (
        <RowActionItem
          icon={RotateCcw}
          disabled={pending}
          onSelect={() => run(reactivateAccessory, 'Accessory reactivated')}
        >
          Reactivate
        </RowActionItem>
      )}

      <RowActionSeparator />

      {partnerId && (
        <RowActionItem href={`/partners/${partnerId}`} icon={Building2}>
          Open partner
        </RowActionItem>
      )}
      <RowActionItem
        href={`/audit?entityType=AccessoryOffering&entityId=${id}`}
        icon={History}
      >
        Audit history
      </RowActionItem>
    </RowActionsMenu>
  )
}
