'use client'

// Client island for the topbar's user / sign-out menu. Split out so the
// server-side DashboardTopbar can stay async + load brand data without
// being marked 'use client'.

import { Button } from '@ilaunchify/ui'
import { signOut } from 'next-auth/react'

export function TopbarUserMenu({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-sm text-zinc-500 sm:block">{email}</div>
      <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/login' })}>
        Sign out
      </Button>
    </div>
  )
}
