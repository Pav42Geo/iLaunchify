'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import { Inbox, Building2, Users, Package, ShieldCheck, ShoppingBag, History, Plug, Award, Crown } from 'lucide-react'

const NAV = [
  { href: '/leads',             label: 'Leads',             icon: Inbox },
  { href: '/partners',          label: 'Partners',          icon: Building2 },
  { href: '/creators',          label: 'Creators',          icon: Users },
  { href: '/products',          label: 'Products',          icon: Package },
  { href: '/orders',            label: 'Orders',            icon: ShoppingBag },
  { href: '/tiers',             label: 'Tiers & plans',     icon: Crown },
  { href: '/channels',          label: 'Channels',          icon: Plug },
  { href: '/compliance',        label: 'Compliance',        icon: ShieldCheck },
  { href: '/certificate-types', label: 'Cert library',      icon: Award },
  { href: '/audit',             label: 'Audit log',         icon: History },
]

export function AdminSidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-4 lg:block">
      <div className="mb-6 px-2 text-xs font-medium text-zinc-500">Admin console</div>
      <nav className="space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
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
