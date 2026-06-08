'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RowActionsMenu, RowActionItem } from '@ilaunchify/ui'
import { Power, Layers, Columns3, Repeat, Shuffle, Trash2 } from 'lucide-react'
import { updatePackingProfile, deletePackingProfile, type PackingProfilePatch } from './actions'

export interface ProfileRow {
  id: string
  name: string
  flavorMode: 'SINGLE' | 'MULTI'
  labelColumns: number
  isActive: boolean
  isSubscription: boolean
  isCustomizable: boolean
}

export function PackingTypeRowActions({ row }: { row: ProfileRow }) {
  const router = useRouter()
  const [, start] = useTransition()

  function save(patch: PackingProfilePatch) {
    start(async () => {
      const res = await updatePackingProfile(row.id, patch)
      if (!res.ok) alert(res.error) // eslint-disable-line no-alert
      else router.refresh()
    })
  }
  function remove() {
    if (!confirm(`Delete "${row.name}"? Products using it keep their reference.`)) return
    start(async () => {
      const res = await deletePackingProfile(row.id)
      if (!res.ok) alert(res.error) // eslint-disable-line no-alert
      else router.refresh()
    })
  }

  const multi = row.flavorMode === 'MULTI'

  return (
    <RowActionsMenu label={`Actions for ${row.name}`}>
      <RowActionItem icon={Power} onSelect={() => save({ isActive: !row.isActive })}>
        {row.isActive ? 'Deactivate' : 'Activate'}
      </RowActionItem>
      <RowActionItem icon={Layers} onSelect={() => save({ flavorMode: multi ? 'SINGLE' : 'MULTI' })}>
        {multi ? 'Make single-recipe' : 'Make base + presets'}
      </RowActionItem>
      {multi &&
        [2, 3, 4, 6].map((n) => (
          <RowActionItem key={n} icon={Columns3} onSelect={() => save({ labelColumns: n })}>
            Facts: up to {n} columns{row.labelColumns === n ? ' ✓' : ''}
          </RowActionItem>
        ))}
      <RowActionItem icon={Repeat} onSelect={() => save({ isSubscription: !row.isSubscription })}>
        Subscription: {row.isSubscription ? 'on ✓' : 'off'}
      </RowActionItem>
      <RowActionItem icon={Shuffle} onSelect={() => save({ isCustomizable: !row.isCustomizable })}>
        Pick-N: {row.isCustomizable ? 'on ✓' : 'off'}
      </RowActionItem>
      <RowActionItem icon={Trash2} danger onSelect={remove}>
        Delete
      </RowActionItem>
    </RowActionsMenu>
  )
}
