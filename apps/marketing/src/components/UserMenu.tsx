'use client'

// UserMenu — avatar + dropdown for logged-in creators in the marketing /
// marketplace headers.
//
// P3 of the account-menus plan (docs/ACCOUNT_MENUS_PROPOSAL.md, 2026-07-06):
// the old hand-rolled fork of AppHeaderUserMenu is gone — this is now a thin
// wrapper over the shared component with the creator menu-v2 contract
// (identity + tier chip + ONE work shortcut + account section). All targets
// are cross-app (apps/creator) via creatorUrl() + external.
//
// Also fixes a latent bug: the headers never passed onSignOut, so the old
// fork's Sign out button was a silent no-op — we call next-auth signOut
// directly now (same as the dashboard topbars).

import { AppHeaderUserMenu } from '@ilaunchify/ui'
import {
  ShoppingBag,
  Crown,
  CreditCard,
  Plug,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { creatorUrl } from '@/lib/app-urls'

export interface UserMenuProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    /** Subscription tier shown as a chip under the name. */
    tier?: 'maker' | 'builder' | 'agency'
    /** Currently-active brand label (multi-brand support per memory). */
    activeBrandName?: string | null
  }
  /** @deprecated — sign-out is handled internally now (next-auth signOut). */
  onSignOut?: () => void
}

export function UserMenu({ user, onSignOut }: UserMenuProps) {
  return (
    <AppHeaderUserMenu
      user={user}
      tierLabels={{ maker: 'Maker', builder: 'Builder', agency: 'Agency' }}
      manageTierHref={creatorUrl('/settings/plan')}
      activeBrandHref={creatorUrl('/brands')}
      avatarTone="pink"
      sections={[
        {
          items: [
            // The ONE work shortcut (menu v2 contract) — the creator app's
            // sidebar owns the rest of nav once they're there.
            { label: 'Orders', href: creatorUrl('/orders'), icon: ShoppingBag, external: true },
          ],
        },
        {
          label: 'Account',
          items: [
            { label: 'Plan & billing', href: creatorUrl('/settings/plan'), icon: Crown, external: true },
            { label: 'Payments', href: creatorUrl('/settings/payouts'), icon: CreditCard, external: true },
            { label: 'Channels', href: creatorUrl('/channels'), icon: Plug, external: true },
            { label: 'Settings', href: creatorUrl('/settings'), icon: Settings, external: true },
          ],
        },
        {
          items: [
            { label: 'Help & support', href: creatorUrl('/help'), icon: HelpCircle, external: true },
          ],
        },
      ]}
      onSignOut={() => {
        onSignOut?.()
        void signOut({ callbackUrl: '/' })
      }}
    />
  )
}
