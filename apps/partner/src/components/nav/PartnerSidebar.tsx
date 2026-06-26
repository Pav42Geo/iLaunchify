'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import { Inbox, Wrench, Settings, BarChart3, FileCheck2, LifeBuoy, DollarSign, Box, Award, Package, Gift, Printer } from 'lucide-react'
import type { PartnerStatus } from '@ilaunchify/db'

interface NavItem {
  href: string
  label: string
  icon: typeof Inbox
}

const FULL_NAV: NavItem[] = [
  { href: '/dashboard',       label: 'Dashboard',       icon: BarChart3 },
  { href: '/orders',          label: 'Orders',          icon: Inbox },
  { href: '/products',        label: 'Products',        icon: Package },
  { href: '/services',        label: 'Services',        icon: Wrench },
  { href: '/packaging',       label: 'Packaging',       icon: Box },
  { href: '/print-spec',      label: 'Prepress output', icon: Printer },
  { href: '/accessories',     label: 'Accessories',     icon: Gift },
  { href: '/certifications',  label: 'Certifications',  icon: Award },
  { href: '/payments',        label: 'Payments',        icon: DollarSign },
  // /my-application is intentionally absent here — once a partner is ACTIVE the
  // application is closed; the record lives in the admin console. It only shows
  // in RESTRICTED_NAV (pre-approval applicants).
  { href: '/settings',        label: 'Settings',        icon: Settings },
]

// Restricted shell — pre-approval, in-progress, or suspended partners.
// They can see their application and get help; everything else is hidden.
const RESTRICTED_NAV: NavItem[] = [
  { href: '/my-application',  label: 'My Application',  icon: FileCheck2 },
  { href: '/help',            label: 'Help',            icon: LifeBuoy },
]

interface PartnerSidebarProps {
  status: PartnerStatus
  restricted: boolean
}

function statusBadge(status: PartnerStatus): { label: string; className: string } {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', className: 'bg-success-50 text-success-700 ring-success-200' }
    case 'UNDER_REVIEW':
      return { label: 'Under review', className: 'bg-info-50 text-info-700 ring-info-200' }
    case 'IN_PROGRESS':
      return { label: 'Action needed', className: 'bg-warning-50 text-warning-700 ring-warning-200' }
    case 'SUSPENDED':
      return { label: 'Suspended', className: 'bg-danger-50 text-danger-700 ring-danger-200' }
    case 'DRAFT':
    case 'INVITED':
    default:
      return { label: status, className: 'bg-ink-100 text-ink-700 ring-ink-200' }
  }
}

export function PartnerSidebar({ status, restricted }: PartnerSidebarProps) {
  const pathname = usePathname()
  const nav = restricted ? RESTRICTED_NAV : FULL_NAV
  const badge = statusBadge(status)

  return (
    <aside data-partner-sidebar className="hidden w-56 shrink-0 border-r border-ink-200 bg-white p-4 lg:block">
      <div className="mb-6 px-2">
        <div className="text-xs font-medium text-ink-500">Partner portal</div>
        <span
          className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      <nav className="space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-600 hover:bg-ink-50',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
      {restricted && (
        <p className="mt-6 px-2 text-xs text-ink-500">
          {status === 'UNDER_REVIEW' && (
            <>Your application is being reviewed. We&apos;ll email you when there&apos;s an update.</>
          )}
          {status === 'IN_PROGRESS' && (
            <>An admin has requested changes. See My Application for details.</>
          )}
          {status === 'SUSPENDED' && (
            <>Your account is suspended. Reach out to partners@ilaunchify.com to discuss.</>
          )}
        </p>
      )}
    </aside>
  )
}
