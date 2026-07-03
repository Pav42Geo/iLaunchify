'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserCheck } from 'lucide-react'
import { acceptPartnerInvite } from '../../(dashboard)/settings/team/actions'

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function accept() {
    setBusy(true)
    try {
      const r = await acceptPartnerInvite({ token })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Welcome aboard — taking you to the dashboard')
      router.push('/dashboard')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={accept}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-900 px-6 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
    >
      <UserCheck className="h-4 w-4" aria-hidden="true" />
      {busy ? 'Joining…' : 'Accept invitation'}
    </button>
  )
}
