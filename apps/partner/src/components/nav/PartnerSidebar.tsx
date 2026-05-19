'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import { Inbox, Wrench, Settings, BarChart3 } from 'lucide-react'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/orders',    label: 'Orders',    icon: Inbox },
  { href: '/services',  label: 'Services',  icon: Wrench },
  { href: '/settings',  label: 'Settings',  icon: Settings },
]

export function PartnerSidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-4 lg:block">
      <div className="mb-8 px-2">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          iLaunchify
        </Link>
        <div className="text-xs text-zinc-500">Partner portal</div>
      </div>
      <nav className="space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
