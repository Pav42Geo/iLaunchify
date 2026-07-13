'use client'

// Settings hub rail — the st-rail of design/partner-profile-prototype-v2.html
// (Front Face slice 3). Four groups (Public profile / Standing / Operations /
// Account); every pre-hub settings destination is preserved as a rail item —
// nothing dropped. Items outside /settings (services, certifications, standing,
// performance, payments) are plain links into their existing pages.
//
// Desktop: sticky left rail. Mobile (<lg): horizontal scrolling chip row.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import {
  Bell,
  Building2,
  CreditCard,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  LineChart,
  MessageSquareHeart,
  Package,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Tags,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react'

export interface RailBadges {
  certsNeedAttention: number
  teamCount: number
}

const GROUPS = (b: RailBadges) => [
  {
    label: null as string | null,
    items: [{ label: 'Overview', href: '/settings', icon: LayoutGrid, exact: true }],
  },
  {
    label: 'Public profile',
    items: [
      { label: 'Company profile', href: '/settings/company', icon: Building2 },
      { label: 'Front face (preview)', href: '/profile', icon: Eye },
      { label: 'Capabilities & services', href: '/services', icon: SlidersHorizontal },
      {
        label: 'Certifications',
        href: '/certifications',
        icon: ShieldCheck,
        warn: b.certsNeedAttention > 0 ? b.certsNeedAttention : undefined,
      },
      { label: 'Portfolio', href: '/settings/portfolio', icon: ImageIcon },
    ],
  },
  {
    label: 'Standing',
    items: [
      { label: 'Merit & fee tier', href: '/standing', icon: Star },
      { label: 'Performance', href: '/performance', icon: LineChart },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Fulfillment', href: '/settings/fulfillment', icon: Package },
      { label: 'Shipping', href: '/settings/shipping', icon: Truck },
      { label: 'Storage', href: '/settings/storage', icon: Warehouse },
      { label: 'Market participation', href: '/settings/participation', icon: Globe },
      { label: 'Product defaults', href: '/settings/product-defaults', icon: Route },
      { label: 'Labeling', href: '/settings/labeling', icon: Tags },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        label: 'Team & roles',
        href: '/settings/team',
        icon: Users,
        count: b.teamCount > 0 ? b.teamCount : undefined,
      },
      { label: 'Payouts', href: '/payments', icon: Wallet },
      { label: 'Billing', href: '/settings/billing', icon: CreditCard },
      { label: 'Tax documents', href: '/settings/tax-documents', icon: FileText },
      { label: 'Notifications', href: '/settings/notifications', icon: Bell },
      { label: 'Feedback', href: '/settings/feedback', icon: MessageSquareHeart },
    ],
  },
]

type RailItem = {
  label: string
  href: string
  icon: typeof Building2
  exact?: boolean
  warn?: number
  count?: number
}

export function SettingsRail({ badges }: { badges: RailBadges }) {
  const pathname = usePathname()
  const groups = GROUPS(badges)
  const isActive = (item: RailItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <>
      {/* Desktop rail */}
      <nav className="hidden w-[240px] flex-none rounded-2xl border border-ink-200 bg-ink-50 p-3 lg:sticky lg:top-4 lg:block">
        {groups.map((g, gi) => (
          <div key={g.label ?? gi} className={cn(gi > 0 && 'mt-4')}>
            {g.label && (
              <div className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-400">
                {g.label}
              </div>
            )}
            {(g.items as RailItem[]).map((item) => {
              const active = isActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-[9px] text-[13px] transition-colors',
                    active
                      ? 'bg-pink-50 font-semibold text-pink-700'
                      : 'font-medium text-ink-700 hover:bg-ink-100',
                  )}
                >
                  <item.icon
                    className={cn('h-4 w-4 flex-none', active ? 'text-pink-700' : 'text-ink-500')}
                  />
                  <span className="truncate">{item.label}</span>
                  {item.warn != null && (
                    <span className="ml-auto rounded-full bg-warning-500 px-1.5 py-px text-[10px] font-bold text-white">
                      {item.warn}
                    </span>
                  )}
                  {item.count != null && (
                    <span className="ml-auto rounded-full bg-pink-500 px-1.5 py-px text-[10px] font-bold text-white">
                      {item.count}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Mobile chip row */}
      <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
        {groups
          .flatMap((g) => g.items as RailItem[])
          .map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors',
                  active
                    ? 'border-pink-200 bg-pink-50 text-pink-700'
                    : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
                {item.warn != null && (
                  <span className="rounded-full bg-warning-500 px-1.5 text-[10px] font-bold text-white">
                    {item.warn}
                  </span>
                )}
              </Link>
            )
          })}
      </nav>
    </>
  )
}
