'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { revokeAdminInvite } from './actions'

type InviteRow = {
  id: string
  email: string
  roleLabel: string
  invitedBy: string | null
  expiresLabel: string
}

export function PendingInvitesTable({ invites }: { invites: InviteRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function revoke(id: string, email: string) {
    start(async () => {
      const r = await revokeAdminInvite({ inviteId: id })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Revoked the invite for ${email}.`)
      router.refresh()
    })
  }

  if (invites.length === 0) return null

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="border-b border-ink-100 bg-cream px-4 py-2.5">
        <h2 className="font-display text-[13.5px] font-semibold tracking-tight text-ink-900">
          {invites.length} pending invite{invites.length === 1 ? '' : 's'}
        </h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-100 text-[10.5px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2.5 font-semibold">Email</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold">Invited by</th>
              <th className="px-4 py-2.5 font-semibold">Expires</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                <td className="px-4 py-3 font-medium text-ink-900">{i.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-2.5 py-[3px] text-[11px] font-medium text-ink-700">
                    {i.roleLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-[12px] text-ink-500">{i.invitedBy ?? '—'}</td>
                <td className="px-4 py-3 text-[12px] text-ink-500">{i.expiresLabel}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => revoke(i.id, i.email)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2.5 py-1 text-[12px] font-medium text-ink-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
