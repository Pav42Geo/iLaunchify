'use client'

// =============================================================================
// RuleRowControls — toggle isActive + delete (refused if locked).
// =============================================================================

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
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
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      role="switch"
      aria-checked={isActive}
      aria-label={isActive ? 'Deactivate rule' : 'Activate rule'}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50 ${
        isActive
          ? 'border-emerald-300 bg-emerald-500'
          : 'border-ink-200 bg-ink-100'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          isActive ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
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
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
