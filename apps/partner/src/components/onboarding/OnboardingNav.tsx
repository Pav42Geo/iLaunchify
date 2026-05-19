'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import { Building, Wrench, FileText, CreditCard, CheckCircle2 } from 'lucide-react'

const STEPS = [
  { href: '/onboarding',           label: 'Overview',  icon: CheckCircle2 },
  { href: '/onboarding/company',   label: 'Company',   icon: Building },
  { href: '/onboarding/service',   label: 'Service',   icon: Wrench },
  { href: '/onboarding/documents', label: 'Documents', icon: FileText },
  { href: '/onboarding/stripe',    label: 'Payouts',   icon: CreditCard },
]

export function OnboardingNav({
  partnerStatus,
  services,
}: {
  partnerStatus: string
  services: Array<{ status: string }>
}) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
      {STEPS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
              active ? 'bg-zinc-900 font-medium text-white' : 'text-zinc-600 hover:bg-zinc-100',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        )
      })}
      <div className="ml-auto rounded-md bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
        {partnerStatus}
      </div>
    </nav>
  )
}
