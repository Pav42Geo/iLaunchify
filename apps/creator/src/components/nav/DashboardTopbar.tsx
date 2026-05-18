'use client'

import { Button } from '@ilaunchify/ui'
import { signOut } from 'next-auth/react'
import type { User } from '@ilaunchify/auth'

export function DashboardTopbar({ user }: { user: User }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
      <div className="text-sm text-zinc-500">{user.email}</div>
      <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/login' })}>
        Sign out
      </Button>
    </header>
  )
}
