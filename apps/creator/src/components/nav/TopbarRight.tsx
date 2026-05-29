'use client'

// Right cluster for the creator dashboard topbar (REBUILD R1.3).
//
// Heart · Notifications bell · BrandSwitcher (when ≥2 brands) ·
// AppHeaderUserMenu with creator-specific menu items.

import { AppHeaderIconButton, AppHeaderUserMenu } from '@ilaunchify/ui'
import {
  Heart,
  Bell,
  LayoutDashboard,
  Layers,
  Package,
  ShoppingBag,
  Plug,
  CreditCard,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { BrandSwitcher, type BrandOption } from './BrandSwitcher'

interface Props {
  email: string
  name: string | null
  brands: BrandOption[]
  activeBrandId: string
  hasUnreadNotifications?: boolean
  tier?: 'maker' | 'builder' | 'agency' | null
}

export function TopbarRight({
  email,
  name,
  brands,
  activeBrandId,
  hasUnreadNotifications = false,
  tier = null,
}: Props) {
  const activeBrand = brands.find((b) => b.id === activeBrandId) ?? brands[0]
  return (
    <>
      <AppHeaderIconButton aria-label="Favorites">
        <Heart strokeWidth={2} className="h-5 w-5" />
      </AppHeaderIconButton>
      <AppHeaderIconButton
        aria-label="Notifications"
        hasDot={hasUnreadNotifications}
      >
        <Bell strokeWidth={2} className="h-5 w-5" />
      </AppHeaderIconButton>
      {brands.length > 1 && <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />}
      <AppHeaderUserMenu
        user={{
          name,
          email,
          tier,
          activeBrandName: activeBrand?.name ?? null,
        }}
        tierLabels={{ maker: 'Maker', builder: 'Builder', agency: 'Agency' }}
        manageTierHref="/settings/profile"
        activeBrandHref="/brands"
        avatarTone="pink"
        sections={[
          {
            items: [
              { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
              { label: 'My brands', href: '/brands', icon: Layers },
              { label: 'My products', href: '/products', icon: Package },
              { label: 'Orders', href: '/orders', icon: ShoppingBag },
            ],
          },
          {
            items: [
              { label: 'Channels', href: '/settings/channels', icon: Plug },
              { label: 'Payments', href: '/settings/payouts', icon: CreditCard },
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
