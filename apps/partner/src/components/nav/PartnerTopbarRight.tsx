'use client'

// Right cluster for the partner dashboard topbar (REBUILD R1.3).
//
// Notification bell + AppHeaderUserMenu with partner-specific items.
// Ink-toned avatar (vs creator's pink) signals the audience.

import { AppHeaderUserMenu } from '@ilaunchify/ui'
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingBag,
  Award,
  FileText,
  CreditCard,
  Settings,
  HelpCircle,
} from 'lucide-react'
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
      <AppHeaderUserMenu
        user={{
          name: name ?? companyName,
          email,
          activeBrandName: companyName,
        }}
        activeBrandHref="/settings"
        avatarTone="ink"
        sections={[
          {
            items: [
              { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
              { label: 'My products', href: '/products', icon: Package },
              { label: 'Packaging', href: '/packaging', icon: Boxes },
              { label: 'Orders', href: '/orders', icon: ShoppingBag },
              { label: 'Certifications', href: '/certifications', icon: Award },
            ],
          },
          {
            items: [
              { label: 'My application', href: '/my-application', icon: FileText },
              { label: 'Payments', href: '/payments', icon: CreditCard },
              { label: 'Settings', href: '/settings', icon: Settings },
            ],
          },
          {
            items: [
              { label: 'Help & support', href: '/help', icon: HelpCircle },
            ],
          },
        ]}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />
    </>
  )
}
