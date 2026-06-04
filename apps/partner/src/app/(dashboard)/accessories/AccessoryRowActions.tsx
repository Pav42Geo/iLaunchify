'use client'

// C7.j — per-row actions for the accessories table. Archive / reactivate via
// the setAccessoryStatus server action (no destructive delete in V1 — archived
// rows stay for audit + any in-flight orders).

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, RotateCcw } from 'lucide-react'
import { RowActionsMenu, RowActionItem } from '@ilaunchify/ui'
import { setAccessoryStatus } from './actions'

export function AccessoryRowActions({
  id,
  name,
  status,
}: {
  id: string
  name: string
  status: string
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function change(to: 'ACTIVE' | 'ARCHIVED') {
    startTransition(async () => {
      const res = await setAccessoryStatus(id, to)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(to === 'ARCHIVED' ? 'Accessory archived' : 'Accessory reactivated')
      router.refresh()
    })
  }

  return (
    <RowActionsMenu label={`Actions for ${name}`}>
      {status === 'ARCHIVED' ? (
        <RowActionItem icon={RotateCcw} onSelect={() => change('ACTIVE')} disabled={pending}>
          Reactivate
        </RowActionItem>
      ) : (
        <RowActionItem icon={Archive} danger onSelect={() => change('ARCHIVED')} disabled={pending}>
          Archive
        </RowActionItem>
      )}
    </RowActionsMenu>
  )
}
