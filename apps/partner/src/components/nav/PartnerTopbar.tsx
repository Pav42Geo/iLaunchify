'use client'

import { Button } from '@ilaunchify/ui'
import { signOut } from 'next-auth/react'
import type { User } from '@ilaunchify/auth'
import { NotificationBell } from '@/components/notifications/NotificationBell'

export function PartnerTopbar({ user, companyName }: { user: User; companyName: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
      <div className="text-sm">
        <span className="font-medium">{companyName}</span>
        <span className="ml-2 text-zinc-500">· {user.email}</span>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/login' })}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
