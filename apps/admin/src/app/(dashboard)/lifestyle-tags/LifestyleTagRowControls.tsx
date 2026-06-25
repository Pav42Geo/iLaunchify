'use client'

// =============================================================================
// LifestyleTagRowControls — isActive toggle + delete (refused while in use).
// =============================================================================

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Switch } from '@ilaunchify/ui'
import { deleteLifestyleTag, toggleLifestyleTagActive } from './actions'

export function LifestyleTagActiveToggle({
  tagId,
  isActive,
}: {
  tagId: string
  isActive: boolean
}) {
  const [pending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      await toggleLifestyleTagActive(tagId)
    })
  }

  return (
    <Switch
      checked={isActive}
      disabled={pending}
      onChange={handleToggle}
      aria-label={isActive ? 'Deactivate tag' : 'Activate tag'}
    />
  )
}

export function DeleteLifestyleTagButton({
  tagId,
  name,
  usageCount,
}: {
  tagId: string
  name: string
  usageCount: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const blocked = usageCount > 0

  function handleClick() {
    if (blocked) {
      if (typeof window !== 'undefined') {
        window.alert(`Cannot remove — used by ${usageCount} product${usageCount === 1 ? '' : 's'}. Reassign first.`)
      }
      return
    }
    if (typeof window !== 'undefined') {
      if (!window.confirm(`Delete lifestyle tag "${name}"? This cannot be undone.`)) {
        return
      }
    }
    setError(null)
    startTransition(async () => {
      const res = await deleteLifestyleTag(tagId)
      if (!res.ok) {
        setError(res.error)
        if (typeof window !== 'undefined') window.alert(res.error)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || blocked}
      aria-label={`Delete ${name}`}
      title={blocked ? `Used by ${usageCount} product${usageCount === 1 ? '' : 's'}` : error ?? `Delete ${name}`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
