'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { grantAdminAccess } from './actions'

type RoleOption = { value: string; label: string }

export function AddAdminForm({ roles }: { roles: RoleOption[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(roles[0]?.value ?? 'SUPPORT_AGENT')
  const [pending, start] = useTransition()

  function submit() {
    if (!email.trim().includes('@')) {
      toast.error('Enter a valid email address.')
      return
    }
    start(async () => {
      const r = await grantAdminAccess({ email: email.trim(), role: role as never })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Admin access granted.')
      setEmail('')
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
        <UserPlus className="h-4 w-4 text-ink-400" /> Grant admin access
      </h2>
      <p className="mt-0.5 text-[12px] text-ink-500">
        Enter the email of someone who already has an account. They&apos;ll become an admin with
        the chosen role. (We don&apos;t create accounts here — they must have signed up first.)
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-[11.5px] text-ink-600">
          <span className="mb-1 block font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@yourcompany.com"
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </label>
        <label className="text-[11.5px] text-ink-600">
          <span className="mb-1 block font-medium">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-ink-200 px-2.5 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {pending ? 'Granting…' : 'Grant access'}
        </button>
      </div>
    </div>
  )
}
