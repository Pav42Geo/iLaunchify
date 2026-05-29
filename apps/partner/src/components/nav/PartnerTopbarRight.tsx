'use client'

// Right cluster for the partner dashboard topbar — visually identical to
// the creator's TopbarRight + the marketplace header (REBUILD R1).
//
// Heart isn't really meaningful for partners (no favorites surface yet),
// so it's omitted in V1. Notifications + user dropdown only.

import { useState, useRef, useEffect } from 'react'
import { AppHeaderIconButton } from '@ilaunchify/ui'
import { Bell, ChevronDown, LogOut, User as UserIcon } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

interface Props {
  email: string
  name: string | null
  companyName: string
}

export function PartnerTopbarRight({ email, name, companyName }: Props) {
  return (
    <>
      <NotificationBell />
      <UserDropdown email={email} name={name} companyName={companyName} />
    </>
  )
}

// =============================================================================
// UserDropdown — partner-flavored small client-side menu
// =============================================================================

function UserDropdown({
  email,
  name,
  companyName,
}: {
  email: string
  name: string | null
  companyName: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [isOpen])

  const displayName = name || email.split('@')[0]
  const initial = (companyName || displayName || '?').charAt(0).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-[12px] font-bold text-white">
          {initial}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-500" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-ink-100 px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink-900">{companyName}</p>
            <p className="truncate text-xs text-ink-500">{email}</p>
          </div>
          <a
            href="/settings"
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
          >
            <UserIcon className="h-3.5 w-3.5" />
            Account settings
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
