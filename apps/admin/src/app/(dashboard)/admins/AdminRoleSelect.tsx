'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setAdminRole } from './actions'

type RoleOption = { value: string; label: string }

export function AdminRoleSelect({
  userId,
  current,
  isSelf,
  roles,
}: {
  userId: string
  current: string
  isSelf: boolean
  roles: RoleOption[]
}) {
  const router = useRouter()
  const [value, setValue] = useState(current)
  const [pending, start] = useTransition()

  if (isSelf) {
    return <span className="text-[12px] text-ink-400">Your account</span>
  }

  function onChange(next: string) {
    const prev = value
    setValue(next)
    start(async () => {
      const res = await setAdminRole({ userId, role: next as never })
      if (!res.ok) {
        toast.error(res.error)
        setValue(prev)
        return
      }
      toast.success('Role updated.')
      router.refresh()
    })
  }

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
    >
      {roles.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  )
}
