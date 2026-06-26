'use client'

// =============================================================================
// RuleRowControls — toggle isActive + delete (refused if locked).
// =============================================================================

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Switch } from '@ilaunchify/ui'
import { deleteNicheRule, toggleNicheRuleActive } from './actions'

export function RuleActiveToggle({
  ruleId,
  isActive,
}: {
  ruleId: string
  isActive: boolean
}) {
  const [pending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      await toggleNicheRuleActive(ruleId)
    })
  }

  return (
    <Switch
      checked={isActive}
      disabled={pending}
      onChange={handleToggle}
      aria-label={isActive ? 'Deactivate rule' : 'Activate rule'}
    />
  )
}

export function DeleteRuleButton({
  ruleId,
  slug,
  isLocked,
}: {
  ruleId: string
  slug: string
  isLocked: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (isLocked) {
      if (typeof window !== 'undefined') {
        window.alert('This rule is locked — unlock it before deleting.')
      }
      return
    }
    if (typeof window !== 'undefined') {
      if (!window.confirm(`Delete rule "${slug}"? This cannot be undone.`)) {
        return
      }
    }
    setError(null)
    startTransition(async () => {
      const res = await deleteNicheRule(ruleId)
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
      disabled={pending || isLocked}
      aria-label={`Delete rule ${slug}`}
      title={isLocked ? 'Locked — unlock before deleting' : error ?? `Delete ${slug}`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-danger-600 transition-colors hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
