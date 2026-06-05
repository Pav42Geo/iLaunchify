'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Archive, RotateCcw } from 'lucide-react'
import { RowActionsMenu, RowActionItem, RowActionSeparator } from '@ilaunchify/ui'
import { setPhraseActive } from './actions'

export function PhraseRowActions({
  id,
  title,
  isActive,
}: {
  id: string
  title: string
  isActive: boolean
}) {
  const router = useRouter()
  const [pending, start] = React.useTransition()

  function toggle(to: boolean) {
    start(async () => {
      const res = await setPhraseActive(id, to)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(to ? 'Phrase activated' : 'Phrase archived')
      router.refresh()
    })
  }

  return (
    <RowActionsMenu label={`Actions for ${title}`}>
      <RowActionItem icon={Pencil} href={`/mandatory-phrases/${id}`}>
        Edit
      </RowActionItem>
      <RowActionSeparator />
      {isActive ? (
        <RowActionItem icon={Archive} danger onSelect={() => toggle(false)} disabled={pending}>
          Archive
        </RowActionItem>
      ) : (
        <RowActionItem icon={RotateCcw} onSelect={() => toggle(true)} disabled={pending}>
          Activate
        </RowActionItem>
      )}
    </RowActionsMenu>
  )
}
