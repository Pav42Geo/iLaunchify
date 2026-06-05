'use client'

// C8 — per-row 3-dot menu for the decoration-compatibility matrix.
//
// Toggle active/inactive + Delete call the server actions directly (useTransition
// + toast + refresh). Edit notes deep-links to the edit form page. Mirrors the
// partner-side / accessories AccessoryRowActions pattern.

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Power, PowerOff, Pencil, Trash2, History } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'
import type { ContainerCategory, DecorationMethod } from '@ilaunchify/db'
import { setCompatibilityActive, deleteCompatibility } from './actions'

interface Props {
  containerCategory: ContainerCategory
  decorationMethod: DecorationMethod
  /** Composite-key audit entityId — "<CATEGORY>:<METHOD>". */
  auditId: string
  label: string
  isActive: boolean
}

export function CompatRowActions({
  containerCategory,
  decorationMethod,
  auditId,
  label,
  isActive,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function run(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMsg: string,
  ) {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(successMsg)
      router.refresh()
    })
  }

  const editHref = `/decoration-compatibility/edit?category=${containerCategory}&method=${decorationMethod}`

  return (
    <RowActionsMenu label={`Actions for ${label}`}>
      <RowActionLabel>{label}</RowActionLabel>

      {isActive ? (
        <RowActionItem
          icon={PowerOff}
          disabled={pending}
          onSelect={() =>
            run(
              () => setCompatibilityActive(containerCategory, decorationMethod, false),
              'Combo deactivated',
            )
          }
        >
          Set inactive
        </RowActionItem>
      ) : (
        <RowActionItem
          icon={Power}
          disabled={pending}
          onSelect={() =>
            run(
              () => setCompatibilityActive(containerCategory, decorationMethod, true),
              'Combo activated',
            )
          }
        >
          Set active
        </RowActionItem>
      )}

      <RowActionItem href={editHref} icon={Pencil}>
        Edit notes
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem
        href={`/audit?entityType=PackagingDecorationCompatibility&entityId=${auditId}`}
        icon={History}
      >
        Audit history
      </RowActionItem>

      <RowActionItem
        icon={Trash2}
        danger
        disabled={pending}
        onSelect={() =>
          run(
            () => deleteCompatibility(containerCategory, decorationMethod),
            'Combo deleted',
          )
        }
      >
        Delete
      </RowActionItem>
    </RowActionsMenu>
  )
}
