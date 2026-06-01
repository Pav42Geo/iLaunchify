'use client'

// Single PartnerService active/paused toggle button used in the Services
// snapshot panel on the partner detail page. Flips the service-level
// status without touching the partner-wide FSM. Audit-logged via
// togglePartnerService.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, PauseCircle, PlayCircle } from 'lucide-react'
import { togglePartnerService } from './actions'

interface Props {
  serviceId: string
  isActive: boolean
}

export function ServiceToggleButton({ serviceId, isActive }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const r = await togglePartnerService({ serviceId, toActive: !isActive })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(
        isActive ? 'Service paused · audit logged' : 'Service activated · audit logged',
      )
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={
        isActive
          ? 'inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50'
          : 'inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50'
      }
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : isActive ? (
        <PauseCircle className="h-3 w-3" aria-hidden="true" />
      ) : (
        <PlayCircle className="h-3 w-3" aria-hidden="true" />
      )}
      {isActive ? 'Pause' : 'Activate'}
    </button>
  )
}
