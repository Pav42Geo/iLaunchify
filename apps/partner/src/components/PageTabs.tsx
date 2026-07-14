'use client'

// Route-based tab bar for the 5 tab-merged pages (Pavel 2026-07-13,
// design/partner-merged-sidebar-tokens.html). Tabs are LINKS to the real
// existing routes — every page keeps its URL, data fetching, and guards;
// this bar just sits above the content on each member of the set.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'

const TAB_SETS = {
  // Deep merges (Pavel 2026-07-14): FC queues under Orders, Accessories under
  // Products, Prepress under Packaging, Certifications under Company,
  // Co-partners under Services, Storage billing under Payments.
  orders: [
    { href: '/orders', label: 'Dispatches' },
    { href: '/inbound', label: 'Inbound' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/outbound', label: 'Outbound' },
  ],
  products: [
    { href: '/products', label: 'Products' },
    { href: '/accessories', label: 'Accessories' },
  ],
  // IA reorg (Pavel 2026-07-14): the hidden Packaging subpages become visible
  // tabs; Prepress moved into the /services accordions (per-service anyway).
  packaging: [
    { href: '/packaging', label: 'Systems' },
    { href: '/packaging/offerings', label: 'Offerings' },
    { href: '/packaging/dielines', label: 'Die-lines' },
  ],
  // One inbox for everything asked of the partner (Pavel 2026-07-14).
  requests: [
    { href: '/opportunities', label: 'Opportunities' },
    { href: '/on-demand', label: 'On-demand' },
    { href: '/capability-requests', label: 'Capability RFQs' },
  ],
  company: [
    { href: '/settings/company', label: 'Profile' },
    { href: '/profile', label: 'Front face (preview)' },
    { href: '/certifications', label: 'Certifications' },
  ],
  services: [
    { href: '/services', label: 'Services' },
    { href: '/co-partners', label: 'Co-partners' },
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
    { href: '/billing', label: 'Storage billing' },
  ],
  preferences: [
    { href: '/settings/notifications', label: 'Notifications' },
    { href: '/settings/feedback', label: 'Feedback' },
  ],
} as const

export type PageTabGroup = keyof typeof TAB_SETS

export function PageTabs({
  group,
  hidden = [],
}: {
  group: PageTabGroup
  /** Role-conditional tabs — hrefs to omit (e.g. '/billing' for non-FC partners). */
  hidden?: string[]
}) {
  const pathname = usePathname()
  const tabs = TAB_SETS[group].filter((t) => !hidden.includes(t.href))
  // A single remaining tab is no tab bar at all.
  if (tabs.length < 2) return null
  // LONGEST-prefix match wins so nested tabs (/packaging vs /packaging/offerings)
  // light exactly one tab.
  const activeHref = tabs
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
  return (
    <div className="flex gap-0 overflow-x-auto border-b border-ink-200">
      {tabs.map((t) => {
        const active = t.href === activeHref
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
