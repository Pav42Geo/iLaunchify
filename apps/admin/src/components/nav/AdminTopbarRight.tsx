'use client'

// Right cluster for the admin dashboard topbar (REBUILD R1.3).
//
// Notification bell + AppHeaderUserMenu with admin-specific items.
// Ink-toned avatar signals the audience.

import { AppHeaderUserMenu } from '@ilaunchify/ui'
import {
  Users,
  Inbox,
  Building2,
  Package,
  ShoppingBag,
  ShieldCheck,
  FileSearch,
  Settings,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

interface Props {
  email: string
  name: string | null
}

export function AdminTopbarRight({ email, name }: Props) {
  return (
    <>
      <NotificationBell />
      <AppHeaderUserMenu
        user={{ name, email }}
        avatarTone="ink"
        sections={[
          {
            items: [
              { label: 'Leads', href: '/leads', icon: Inbox },
              { label: 'Partners', href: '/partners', icon: Building2 },
              { label: 'Creators', href: '/creators', icon: Users },
              { label: 'Products', href: '/products', icon: Package },
              { label: 'Orders', href: '/orders', icon: ShoppingBag },
            ],
          },
          {
            items: [
              { label: 'Certificate types', href: '/certificate-types', icon: ShieldCheck },
              { label: 'Audit log', href: '/audit', icon: FileSearch },
              { label: 'Settings', href: '/settings', icon: Settings },
            ],
          },
        ]}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />
    </>
  )
}
