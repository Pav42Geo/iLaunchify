'use client'

// Route-based tab bar for the 5 tab-merged pages (Pavel 2026-07-13,
// design/partner-merged-sidebar-tokens.html). Tabs are LINKS to the real
// existing routes — every page keeps its URL, data fetching, and guards;
// this bar just sits above the content on each member of the set.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'

const TAB_SETS = {
  company: [
    { href: '/settings/company', label: 'Profile' },
    { href: '/profile', label: 'Front face (preview)' },
  ],
  standing: [
    { href: '/standing', label: 'Merit & fee tier' },
    { href: '/performance', label: 'Performance' },
  ],
  logistics: [
    { href: '/settings/fulfillment', label: 'Receiving & availability' },
    { href: '/settings/shipping', label: 'Carrier & shipping' },
  ],
  payments: [
    { href: '/payments', label: 'Payouts' },
    { href: '/settings/billing', label: 'Billing' },
    { href: '/settings/tax-documents', label: 'Tax documents' },
  ],
  preferences: [
    { href: '/settings/notifications', label: 'Notifications' },
    { href: '/settings/feedback', label: 'Feedback' },
  ],
} as const

export type PageTabGroup = keyof typeof TAB_SETS

export function PageTabs({ group }: { group: PageTabGroup }) {
  const pathname = usePathname()
  return (
    <div className="flex gap-0 overflow-x-auto border-b border-ink-200">
      {TAB_SETS[group].map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'mr-[22px] whitespace-nowrap border-b-[2.5px] px-1 py-2.5 text-[13.5px] font-semibold transition-colors',
              active
                ? 'border-pink-500 text-pink-700'
                : 'border-transparent text-ink-500 hover:text-ink-900',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
