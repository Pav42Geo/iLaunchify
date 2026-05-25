'use client'

// Inline status pill + transition button(s) on the packaging edit page.
//   DRAFT  -> [Activate] (gated: must have ≥1 surface)
//   ACTIVE -> [Retire]
//   RETIRED -> [Reactivate]

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { toast } from 'sonner'
import type { PackagingStatus } from '@prisma/client'
import { setPackagingStatus } from '../actions'

export function PackagingStatusToggle({
  packagingSystemId,
  currentStatus,
  hasSurfaces,
}: {
  packagingSystemId: string
  currentStatus: PackagingStatus
  hasSurfaces: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function go(to: PackagingStatus) {
    startTransition(async () => {
      const result = await setPackagingStatus(packagingSystemId, to)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Packaging ${to.toLowerCase()}`)
      router.refresh()
    })
  }

  if (currentStatus === 'DRAFT') {
    const lockedReason = !hasSurfaces ? 'Add at least one surface before activating.' : undefined
    return (
      <Button
        onClick={() => go('ACTIVE')}
        disabled={isPending || !hasSurfaces}
        title={lockedReason}
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        {isPending ? 'Activating…' : 'Activate'}
      </Button>
    )
  }

  if (currentStatus === 'ACTIVE') {
    return (
      <Button
        onClick={() => go('RETIRED')}
        disabled={isPending}
        variant="outline"
        className="border-amber-300 text-amber-700 hover:bg-amber-50"
      >
        {isPending ? 'Retiring…' : 'Retire'}
      </Button>
    )
  }

  // RETIRED
  return (
    <Button
      onClick={() => go('ACTIVE')}
      disabled={isPending}
      variant="outline"
    >
      {isPending ? 'Reactivating…' : 'Reactivate'}
    </Button>
  )
}
