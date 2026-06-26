'use client'

// C7 — deprecate / reactivate a LabelingSymbol.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { toast } from 'sonner'
import type { AssetCatalogStatus } from '@ilaunchify/db'
import { setLabelingSymbolStatus } from './actions'

export function StatusToggle({ id, status }: { id: string; status: AssetCatalogStatus }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function toggle(to: AssetCatalogStatus) {
    startTransition(async () => {
      const res = await setLabelingSymbolStatus(id, to)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Symbol ${to.toLowerCase()}`)
      router.refresh()
    })
  }

  return status === 'ACTIVE' ? (
    <Button
      variant="outline"
      className="border-warning-300 text-warning-700 hover:bg-warning-50"
      onClick={() => toggle('DEPRECATED')}
      disabled={isPending}
    >
      Deprecate
    </Button>
  ) : (
    <Button variant="outline" onClick={() => toggle('ACTIVE')} disabled={isPending}>
      Reactivate
    </Button>
  )
}
