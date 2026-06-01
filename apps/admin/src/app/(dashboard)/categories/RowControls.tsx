'use client'

// =============================================================================
// RowControls — small client wrappers that fire server-action mutations and
// show inline errors. Used by both Category and Subcategory rows for the
// destructive (trash) and reorder (chevron up/down) actions.
// =============================================================================

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import {
  deleteCategory,
  deleteSubcategory,
  moveCategory,
  moveSubcategory,
} from './actions'

// -----------------------------------------------------------------------------
// Delete buttons
// -----------------------------------------------------------------------------

export function DeleteCategoryButton({
  categoryId,
  name,
}: {
  categoryId: string
  name: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (typeof window !== 'undefined') {
      if (!window.confirm(`Delete category "${name}"? This cannot be undone.`)) {
        return
      }
    }
    setError(null)
    startTransition(async () => {
      const res = await deleteCategory(categoryId)
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
      disabled={pending}
      aria-label={`Delete ${name}`}
      title={error ?? `Delete ${name}`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

export function DeleteSubcategoryButton({
  subcategoryId,
  name,
}: {
  subcategoryId: string
  name: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (typeof window !== 'undefined') {
      if (!window.confirm(`Delete subcategory "${name}"? This cannot be undone.`)) {
        return
      }
    }
    setError(null)
    startTransition(async () => {
      const res = await deleteSubcategory(subcategoryId)
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
      disabled={pending}
      aria-label={`Delete ${name}`}
      title={error ?? `Delete ${name}`}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
    >
      <Trash2 className="h-3 w-3" />
    </button>
  )
}

// -----------------------------------------------------------------------------
// Reorder buttons — swap displayOrder with adjacent row
// -----------------------------------------------------------------------------

export function ReorderCategory({ categoryId }: { categoryId: string }) {
  const [pending, startTransition] = useTransition()

  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      await moveCategory(categoryId, direction)
    })
  }

  return (
    <div className="inline-flex flex-col items-center justify-center">
      <button
        type="button"
        onClick={() => move('up')}
        disabled={pending}
        aria-label="Move up"
        className="inline-flex h-4 w-5 items-center justify-center rounded text-ink-400 hover:bg-ink-50 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => move('down')}
        disabled={pending}
        aria-label="Move down"
        className="inline-flex h-4 w-5 items-center justify-center rounded text-ink-400 hover:bg-ink-50 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  )
}

export function ReorderSubcategory({ subcategoryId }: { subcategoryId: string }) {
  const [pending, startTransition] = useTransition()

  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      await moveSubcategory(subcategoryId, direction)
    })
  }

  return (
    <div className="inline-flex flex-col items-center justify-center">
      <button
        type="button"
        onClick={() => move('up')}
        disabled={pending}
        aria-label="Move up"
        className="inline-flex h-3.5 w-4 items-center justify-center rounded text-ink-400 hover:bg-ink-50 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
      >
        <ChevronUp className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        onClick={() => move('down')}
        disabled={pending}
        aria-label="Move down"
        className="inline-flex h-3.5 w-4 items-center justify-center rounded text-ink-400 hover:bg-ink-50 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
      >
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}
