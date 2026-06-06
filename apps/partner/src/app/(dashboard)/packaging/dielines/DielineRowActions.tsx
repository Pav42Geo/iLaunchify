'use client'

// Slice C9 Phase 1 — per-row actions for the packaging-dielines table.
// Edit deep-links to the detail page; FSM transitions + delete go through the
// scoped server actions (confirm/activate/archive/delete).

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, CheckCircle2, Rocket, Archive, Trash2 } from 'lucide-react'
import { RowActionsMenu, RowActionItem } from '@ilaunchify/ui'
import type { DielineStatus } from '@ilaunchify/db'
import {
  confirmDieline,
  activateDieline,
  archiveDieline,
  deleteDieline,
} from './dieline-actions'

export function DielineRowActions({
  id,
  label,
  status,
}: {
  id: string
  label: string
  status: DielineStatus
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(ok)
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm(`Delete the ${label} dieline? This cannot be undone.`)) return
    run(() => deleteDieline(id), 'Dieline deleted')
  }

  return (
    <RowActionsMenu label={`Actions for ${label}`}>
      <RowActionItem href={`/packaging/dielines/${id}`} icon={Pencil}>
        Edit
      </RowActionItem>

      {(status === 'UPLOADED' || status === 'PARSED') && (
        <RowActionItem
          icon={CheckCircle2}
          onSelect={() => run(() => confirmDieline(id), 'Spec confirmed')}
          disabled={pending}
        >
          Confirm spec
        </RowActionItem>
      )}
      {(status === 'PARTNER_CONFIRMED' || status === 'ADMIN_VERIFIED') && (
        <RowActionItem
          icon={Rocket}
          onSelect={() => run(() => activateDieline(id), 'Dieline activated')}
          disabled={pending}
        >
          Activate
        </RowActionItem>
      )}
      {status !== 'ARCHIVED' && (
        <RowActionItem
          icon={Archive}
          onSelect={() => run(() => archiveDieline(id), 'Dieline archived')}
          disabled={pending}
        >
          Archive
        </RowActionItem>
      )}

      <RowActionItem icon={Trash2} danger onSelect={remove} disabled={pending}>
        Delete
      </RowActionItem>
    </RowActionsMenu>
  )
}
